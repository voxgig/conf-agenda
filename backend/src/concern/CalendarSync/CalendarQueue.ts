/* The sync queue. SPEC 10.6.
 *
 * "Sync runs through a queue, not in the request. One job per (segment fixture
 * x account) pair so a single failure is isolated and retriable, with
 * exponential backoff and jitter. Progress is observable: the organiser sees a
 * run with per-segment state, not a spinner."
 *
 * THE GRANULARITY IS THE POINT. One job per pair means a provider rejecting
 * one speaker's invitation does not touch the other thirty-nine, and retrying
 * it does not re-send theirs. A run-level retry would do both.
 *
 * JOBS ARE ROWS, NOT PROMISES. A run that survives a restart is the difference
 * between "resume where it stopped" and "start again", and starting again is
 * how a crash becomes a second invitation.
 *
 * THE JOB CARRIES THE DECIDED ITEM, frozen at enqueue time. The organiser
 * confirmed a specific plan (C4); a plan recomputed at execution time could
 * quietly send something they never agreed to, because somebody saved a
 * fixture in between.
 *
 * TIME AND RANDOMNESS ARE INJECTED. Backoff needs jitter, and jitter needs a
 * random source - which makes every test that touches retry timing a coin
 * flip unless both come from options. The upstream plugin already takes this
 * position with its injectable clock (SPEC 10.1).
 */
import { redactReason } from '../../lib/redact'

const DEFAULTS = {
  /** First retry delay. Doubles per attempt. */
  backoff_base: 30 * 1000,
  backoff_max: 30 * 60 * 1000,
  /** Attempts before a job is abandoned and surfaced to the organiser (C9). */
  max_attempts: 5,
  /** Jobs claimed per tick. Bounded so one tick cannot run for ever. */
  batch: 25,
  /**
   * How long a claim holds before another worker may take the job back. A
   * claim that never expires turns one crash into a permanently wedged
   * conference - the same reasoning as the advisory lock's TTL. Generous
   * against a slow provider, because reclaiming a job that is still in flight
   * is how a claim becomes a duplicate.
   */
  claim_ttl: 5 * 60 * 1000,
}


export default function CalendarQueue(this: any, options: any) {
  const seneca: any = this
  const opts = { ...DEFAULTS, ...(options || {}) }
  const now = () => (options && options.now ? options.now() : Date.now())
  // Jitter in [0,1). Injectable so a backoff test is not a coin flip.
  const rand = () => (options && options.rand ? options.rand() : Math.random())

  /**
   * Exponential, with jitter. The jitter is not decoration: a provider that
   * rejected a hundred jobs in one tick would otherwise get all hundred
   * retries back in the same instant, which is how a rate limit becomes an
   * outage.
   */
  function backoffFor(attempts: number): number {
    const flat = Math.min(opts.backoff_max, opts.backoff_base * Math.pow(2, attempts - 1))
    return Math.round(flat * (0.5 + 0.5 * rand()))
  }

  let claimSeq = 0

  /** Job ids being worked by THIS process, right now. See claimJob. */
  const inflight = new Set<string>()

  /** A claim nobody released, from a worker that is not coming back. */
  function stale(job: any, t: number): boolean {
    return 'running' === job.state && (job.claim_at || 0) + opts.claim_ttl <= t
  }

  /** Claimable now: due and pending, or holding a claim that has expired. */
  function claimable(job: any, t: number): boolean {
    if ('pending' === job.state) return (job.next_at || 0) <= t
    return stale(job, t)
  }

  /**
   * CLAIM A JOB BEFORE SENDING IT. Listing is not claiming.
   *
   * work:queue used to list `pending` rows and send them, updating each row
   * only AFTER the provider returned. Two overlapping calls therefore listed
   * the same rows and both sent - and the local tick overlaps itself the
   * moment a provider call outlasts its 1s interval. That is a duplicate
   * invitation AND a duplicated ledger row, which is the single thing this
   * whole subsystem exists to prevent.
   *
   * So the row moves to `running` under a token, and only the writer whose
   * token survives the read-back proceeds. Re-checking `state` and `next_at`
   * here rather than trusting the listing is the point: the row may have
   * settled, or been given a backoff, between the list and the claim.
   *
   * Returns the claimed job, or null when somebody else has it.
   */
  async function claimJob(seneca: any, job_id: string, t: number): Promise<any> {
    // THE SYNCHRONOUS HALF, and it must come before any await. A load /
    // compare / save round-trip has an interleaving in which both callers
    // read `pending` before either writes, so the row claim alone is
    // best-effort. This Set is checked and added with no await in between,
    // and JS is single-threaded, so within one process exactly one caller
    // gets each job - deterministically, not by luck of scheduling.
    if (inflight.has(job_id)) return null
    inflight.add(job_id)

    let claimed: any = null
    try {
      const row = await seneca.entity('sys/calendar_job').load$(job_id)
      if (null == row) return null
      if (!claimable(row.data$(false), t)) return null

      const token = 'c' + ++claimSeq + '.' + Math.floor(rand() * 1e9)
      await row.data$({ state: 'running', claim: token, claim_at: t }).save$()

      // THE DURABLE HALF. The read-back is the compare-and-set: whoever wrote
      // last owns the job, everyone else sees a token that is not theirs. The
      // Set above does not survive a restart and does not exist in a second
      // isolate; the ROW does, which is why both are here. Same two-halves
      // argument as C10's lock plus run row.
      const back = await seneca.entity('sys/calendar_job').load$(job_id)
      if (null == back || back.claim !== token) return null
      claimed = back.data$(false)
      return claimed
    }
    finally {
      // A job that was actually claimed is released by the WORKER, once it
      // settles. Every other exit - not found, not claimable, lost the
      // compare-and-set, a throw - releases here, or the id stays reserved
      // for the life of the process and the job never runs again.
      if (null == claimed) inflight.delete(job_id)
    }
  }

  /**
   * Send one claimed job and settle its row. Returns how much work it did, so
   * the caller's `worked` count - which is what drain:run stops on - still
   * means "jobs attempted".
   *
   * Split out of the loop so the claim can be released in a `finally` around
   * exactly this call, and so every exit below settles the row rather than
   * leaving it `running`.
   */
  async function settleJob(
    seneca: any, job: any, accounts: Map<string, any>, t: number,
  ): Promise<number> {
    const item = JSON.parse(job.item_json)
    const t0 = now()
    const account = accounts.get(job.account_id)

    // EVERY FAILURE IS THIS JOB'S FAILURE, INCLUDING A THROW. The send used
    // to sit bare in the loop, so a rejected post - a missing account is
    // enough, since `account: Object` is required on send:invite - aborted
    // the whole tick before any row was written. Every job stayed `pending`,
    // the run never left `running`, and apply:sync's state guard then refused
    // that conference for ever. One bad row must cost one job, not the
    // conference (C9).
    let out: any
    try {
      if (null == account) {
        out = { ok: false, why: 'account-missing:' + job.account_id }
      }
      else {
        out = await seneca.post('sys:calendar,send:invite', {
          item, account, run_id: job.run_id,
        })
      }
    }
    catch (err: any) {
      out = { ok: false, why: redactReason(err && err.message) }
    }

    const row = await seneca.entity('sys/calendar_job').load$(job.id)
    // The row is gone, so there is nothing to settle - but the attempt was
    // still made, and the caller must not be told the queue is idle.
    if (null == row) return 1

    if (out && out.ok) {
      await seneca.post('sys:calendar,record:link',
        { top_id: job.top_id, item, out, org_id: job.org_id })
      await row.data$({
        state: true === out.noop ? 'noop' : 'sent',
        attempts: (job.attempts || 0) + 1,
        last_error: '',
        claim: '',
        ms: now() - t0,
      }).save$()
      return 1
    }

    // FAILURE. Isolated to this job: the loop carries on, because one
    // provider saying no must not abandon the other speakers (C9).
    const attempts = (job.attempts || 0) + 1
    const why = redactReason(out && out.why)
    const spent = attempts >= opts.max_attempts
    await row.data$({
      // `abandoned` is a state the organiser can see and act on - not a
      // silent give-up, and not an infinite retry either.
      state: spent ? 'abandoned' : 'pending',
      attempts,
      next_at: spent ? 0 : t + backoffFor(attempts),
      last_error: why,
      // Released either way: an abandoned job is settled, and a retried one
      // must be claimable again by the next tick.
      claim: '',
      ms: now() - t0,
    }).save$()

    // A job is a run's unit of retry and dies with the run; the LEDGER is
    // what survives runs. So a failure that is never going to be retried is
    // stamped there too - otherwise "this segment's invitation never went" is
    // a fact that disappears with the run that discovered it.
    if (spent && item.link_id) {
      const link = await seneca.entity('sys/calendar_link').load$(item.link_id)
      if (link) await link.data$({ last_error: why }).save$()
    }
    return 1
  }

  seneca
    .fix('sys:calendar')

    // Turn a confirmed plan into rows. Sends nothing: that is work:queue's job,
    // and separating them is what makes the run observable and resumable.
    .message('enqueue:run', { plan: Object, org_id: String }, async function (
      this: any, msg: any,
    ) {
      const plan = msg.plan
      const t = now()

      const run = await this.entity('sys/calendar_run').make$().data$({
        org_id: msg.org_id,
        top_id: plan.top_id,
        state: 'running',
        t_start: t,
        t_end: 0,
        counts_json: JSON.stringify(plan.counts || {}),
      }).save$()

      for (const item of plan.items) {
        // No-ops are not jobs. They cost no API call by definition, and a
        // queue full of them hides the work that actually has to happen.
        if ('noop' === item.action) continue
        await this.entity('sys/calendar_job').make$().data$({
          org_id: msg.org_id,
          run_id: run.id,
          top_id: plan.top_id,
          fixture_id: item.fixture_id,
          account_id: item.account_id,
          action: item.action,
          uid: item.uid,
          item_json: JSON.stringify(item),
          state: 'pending',
          // Unclaimed, and '' rather than absent: `valid: 'Empty'` permits an
          // empty string but still REQUIRES the field. The same trap as
          // last_error, from the other side - Skip would have rejected the ''
          // that a released claim has to write.
          claim: '',
          attempts: 0,
          next_at: t,
          last_error: '',
        }).save$()
      }

      return { ok: true, run_id: run.id, counts: plan.counts }
    })

    // The worker. Locally this is driven by the plugin's tick; on Cloudflare
    // it is cron (SPEC 10.6). Either way it is the SAME message, which is why
    // the scheduler is a deployment detail rather than a rewrite.
    .message('work:queue', { run_id: String }, async function (this: any, msg: any) {
      const t = now()
      // Candidates, not a work list: the claim below decides. `running` rows
      // are in scope only once their claim has expired, which is what lets a
      // run resume after a crash instead of sitting wedged.
      const jobs = (await this.entity('sys/calendar_job')
        .list$({ run_id: msg.run_id }))
        .map((r: any) => r.data$(false))
        .filter((j: any) => claimable(j, t))
        .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))
        .slice(0, opts.batch)

      const accounts: Map<string, any> = new Map(
        (await this.entity('sys/calendar_account').list$({}))
          .map((r: any) => [String(r.id), r.data$(false)] as [string, any]))

      let worked = 0
      for (const candidate of jobs) {
        // Listing is not claiming - see claimJob. A job someone else already
        // took, or that settled between the list and here, is simply skipped.
        const job = await claimJob(this, candidate.id, t)
        if (null == job) continue

        try {
          worked += await settleJob(this, job, accounts, t)
        }
        finally {
          // The worker owns the reservation from the moment claimJob hands
          // the job over, so it is released in a finally: anywhere else, one
          // throw reserves that id for the life of the process and the job
          // never runs again.
          inflight.delete(job.id)
        }
      }

      // The run closes only when nothing is left that could still be tried -
      // and `running` counts, or an overlapping call closes the run out from
      // under a job that is still with a provider, and the organiser is told
      // the sync finished while an invitation is still in flight.
      const left = (await this.entity('sys/calendar_job')
        .list$({ run_id: msg.run_id }))
        .map((r: any) => r.data$(false))
        .filter((j: any) => 'pending' === j.state || 'running' === j.state)
        .length
      if (0 === left) {
        const run = await this.entity('sys/calendar_run').load$(msg.run_id)
        if (run && 'running' === run.state) {
          const abandoned = (await this.entity('sys/calendar_job')
            .list$({ run_id: msg.run_id, state: 'abandoned' })).length
          await run.data$({
            state: 0 < abandoned ? 'aborted' : 'done',
            t_end: now(),
          }).save$()
          // The run is over, so its outbound budget is too. The queue is the
          // only thing that knows when that happens.
          await this.post('sys:calendar,clear:sends', { run_id: msg.run_id })
        }
      }

      return { ok: true, worked, remaining: left }
    })

    // Work a run until nothing more is DUE. Not "until nothing is pending":
    // a failed job's next attempt is deliberately in the future, and draining
    // past that would defeat the backoff it was just given.
    //
    // This is the local monolith's scheduler stand-in. Stage 4 replaces the
    // CALLER with cron, not this message.
    .message('drain:run', { run_id: String }, async function (this: any, msg: any) {
      let worked = 0
      // Bounded: a job that somehow re-queues itself must not spin for ever.
      for (let i = 0; i < 200; i++) {
        const out = await this.post('sys:calendar,work:queue', { run_id: msg.run_id })
        if (0 === out.worked) break
        worked += out.worked
      }
      return { ok: true, worked }
    })

    // THE LOCAL SCHEDULER (SPEC 10.6: "the plugin's tick is the local
    // scheduler and Cloudflare cron the deployed one"). Works every run that
    // is still open, so a run started from the app makes progress without
    // anything calling drain:run by hand.
    //
    // Deployed, the CALLER changes - cron posts this same message - which is
    // why the scheduler is a deployment detail rather than a rewrite.
    .message('tick:queue', {}, async function (this: any) {
      const open = (await this.entity('sys/calendar_run').list$({ state: 'running' }))
        .map((r: any) => r.data$(false))
      let worked = 0
      for (const run of open) {
        const out = await this.post('sys:calendar,work:queue', { run_id: run.id })
        worked += out.worked || 0
      }
      return { ok: true, runs: open.length, worked }
    })

    // Progress, per segment. "A run with per-segment state, not a spinner."
    .message('get:run', { run_id: String }, async function (this: any, msg: any) {
      const run = await this.entity('sys/calendar_run').load$(msg.run_id)
      if (null == run) return { ok: false, why: 'not-found' }

      // THE RUN IS REACHED THROUGH ITS CONFERENCE, AND THAT IS THE ACCESS
      // CHECK. run_id comes from the browser via aim:web,on:cag,watch:run,
      // and `sys/` entities are exempt from @seneca/owner by design
      // (`ignore: ['sys:entity,base:sys']`, basic.ts) - so reading the run
      // rows directly asked nobody's permission, and a run id held or guessed
      // by any signed-in user returned another org's segment titles, calendar
      // account names, recipient counts, UIDs and error strings.
      //
      // cag/fixture IS owner-annotated, so resolving the conference first
      // puts this read behind the same enforcement as every other read in the
      // app rather than inventing a second one. At Stage 4 that moves behind
      // concern:tenant and this inherits it (see srv/cag/ent_util.ts).
      const top = await this.entity('cag/fixture').load$(run.top_id)
      if (null == top) return { ok: false, why: 'not-found' }

      const jobs = (await this.entity('sys/calendar_job').list$({ run_id: msg.run_id }))
        .map((r: any) => r.data$(false))
        .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))

      // Names, not ids. A run screen listing `demo_open` and `acct_fake` is a
      // log; one listing the session and the calendar is a report.
      const accounts = new Map((await this.entity('sys/calendar_account').list$({}))
        .map((r: any) => [r.id, r.data$(false)]))

      const by = jobs.reduce((acc: Record<string, number>, j: any) => {
        acc[j.state] = (acc[j.state] || 0) + 1
        return acc
      }, {})

      // The conference's NAME. A run screen headed `demo_conf` is a log; one
      // headed "Demo Conf 2027" is a report. Already loaded above, where it
      // doubles as the access check.
      return {
        ok: true,
        title: String((top && top.title) || run.top_id),
        run: {
          id: run.id, top_id: run.top_id, state: run.state,
          t_start: run.t_start, t_end: run.t_end,
          counts: JSON.parse(run.counts_json || '{}'),
        },
        states: by,
        // Everything the queue skipped. "13 no-ops skipped" beside the
        // progress bar is the same C2 argument the plan screen makes.
        noops: (JSON.parse(run.counts_json || '{}').noop) || 0,
        jobs: jobs.map((j: any) => {
          let item: any = {}
          try { item = JSON.parse(j.item_json || '{}') } catch (e) { item = {} }
          const account: any = accounts.get(j.account_id)
          return {
          fixture_id: j.fixture_id, account_id: j.account_id,
          title: String(item.title || j.fixture_id),
          account: String((account && account.name) || j.account_id),
          provider: String((account && account.provider) || ''),
          recipients: (item.recipients || []).length,
          sequence: item.sequence,
          ms: j.ms || 0,
          action: j.action, uid: j.uid, state: j.state,
          attempts: j.attempts, next_at: j.next_at,
          // Already redacted on the way in; passed through, never re-derived
          // from a provider error here.
          last_error: j.last_error || '',
          }
        }),
      }
    })
}
