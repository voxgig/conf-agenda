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
      const jobs = (await this.entity('sys/calendar_job')
        .list$({ run_id: msg.run_id, state: 'pending' }))
        .map((r: any) => r.data$(false))
        .filter((j: any) => (j.next_at || 0) <= t)
        .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))
        .slice(0, opts.batch)

      const accounts = new Map((await this.entity('sys/calendar_account').list$({}))
        .map((r: any) => [r.id, r.data$(false)]))

      let worked = 0
      for (const job of jobs) {
        const item = JSON.parse(job.item_json)
        const out = await this.post('sys:calendar,send:invite', {
          item,
          account: accounts.get(job.account_id),
          run_id: job.run_id,
        })
        worked++

        const row = await this.entity('sys/calendar_job').load$(job.id)
        if (null == row) continue

        if (out && out.ok) {
          await this.post('sys:calendar,record:link',
            { top_id: job.top_id, item, out, org_id: job.org_id })
          await row.data$({
            state: true === out.noop ? 'noop' : 'sent',
            attempts: (job.attempts || 0) + 1,
            last_error: '',
          }).save$()
          continue
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
        }).save$()

        // A job is a run's unit of retry and dies with the run; the LEDGER is
        // what survives runs. So a failure that is never going to be retried
        // is stamped there too - otherwise "this segment's invitation never
        // went" is a fact that disappears with the run that discovered it.
        if (spent && item.link_id) {
          const link = await this.entity('sys/calendar_link').load$(item.link_id)
          if (link) await link.data$({ last_error: why }).save$()
        }
      }

      // The run closes only when nothing is left that could still be tried.
      const left = (await this.entity('sys/calendar_job')
        .list$({ run_id: msg.run_id, state: 'pending' })).length
      if (0 === left) {
        const run = await this.entity('sys/calendar_run').load$(msg.run_id)
        if (run && 'running' === run.state) {
          const abandoned = (await this.entity('sys/calendar_job')
            .list$({ run_id: msg.run_id, state: 'abandoned' })).length
          await run.data$({
            state: 0 < abandoned ? 'aborted' : 'done',
            t_end: now(),
          }).save$()
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

    // Progress, per segment. "A run with per-segment state, not a spinner."
    .message('get:run', { run_id: String }, async function (this: any, msg: any) {
      const run = await this.entity('sys/calendar_run').load$(msg.run_id)
      if (null == run) return { ok: false, why: 'not-found' }

      const jobs = (await this.entity('sys/calendar_job').list$({ run_id: msg.run_id }))
        .map((r: any) => r.data$(false))
        .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))

      const by = jobs.reduce((acc: Record<string, number>, j: any) => {
        acc[j.state] = (acc[j.state] || 0) + 1
        return acc
      }, {})

      return {
        ok: true,
        run: {
          id: run.id, top_id: run.top_id, state: run.state,
          t_start: run.t_start, t_end: run.t_end,
          counts: JSON.parse(run.counts_json || '{}'),
        },
        states: by,
        jobs: jobs.map((j: any) => ({
          fixture_id: j.fixture_id, account_id: j.account_id,
          action: j.action, uid: j.uid, state: j.state,
          attempts: j.attempts, next_at: j.next_at,
          // Already redacted on the way in; passed through, never re-derived
          // from a provider error here.
          last_error: j.last_error || '',
        })),
      }
    })
}
