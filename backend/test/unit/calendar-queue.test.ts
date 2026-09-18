/* The sync queue. SPEC 10.6.
 *
 * The queue exists so that a single failure is ISOLATED and RETRIABLE, and so
 * that the organiser sees per-segment state rather than a spinner. Both of
 * those are claims about what happens when things go wrong, so most of what
 * follows breaks the provider on purpose.
 *
 * Time and randomness are injected. A backoff test on the wall clock is a test
 * that fails on a slow machine, and a jitter test on Math.random is a coin
 * flip that eventually lands on the wrong side in CI.
 */
import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const { fakeState, resetFake } = require('../../dist/concern/CalendarSync/FakeProvider.js')
const { resetSafety } = require('../../dist/concern/CalendarSync/CalendarSafety.js')

const DEMO = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/demo/demo.json'), 'utf8'),
)

/** A clock the test moves by hand. */
function clock(start = 1_800_000_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

async function makeSeneca(cal: any = {}) {
  const seneca = Seneca({ legacy: false, timeout: 9999, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca, { calendarsync: cal })
  seneca.use(CagSrv)
  await seneca.ready()

  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of DEMO[canon] || []) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  await seneca.entity('sys/calendar_account').data$({
    id$: 'acct_fake', org_id: 'org_demo', name: 'Demo calendar',
    provider: 'fake', calendar_id: 'primary', secret_ref: 'sekreto:demo',
    status: 'active',
  }).save$()
  return seneca
}

const enqueue = (seneca: any) =>
  seneca.post('sys:calendar,apply:sync', { fixture_id: 'demo_conf', confirm: true })


describe('the sync queue', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  test('apply:sync enqueues and sends NOTHING in the request', async () => {
    const seneca = await makeSeneca()

    const out = await enqueue(seneca)
    assert.equal(out.ok, true)
    assert.ok(out.run_id, 'no run was created')

    // The whole point of 10.6: the request returns before anything is sent.
    assert.equal(fakeState.calls.length, 0, 'apply:sync sent in the request')

    const jobs = await seneca.entity('sys/calendar_job').list$({ run_id: out.run_id })
    assert.ok(0 < jobs.length)
    assert.ok(jobs.every((j: any) => 'pending' === j.state))

    await seneca.close()
  })

  test('one job per (segment x account), and no job for a no-op', async () => {
    const seneca = await makeSeneca()

    const first = await enqueue(seneca)
    await seneca.post('sys:calendar,drain:run', { run_id: first.run_id })

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    assert.ok(0 < plan.counts.noop, 'nothing settled, so this proves nothing')

    // Everything is now up to date, so the second run has nothing to do - and
    // enqueues nothing rather than a queue full of no-ops.
    const second = await enqueue(seneca)
    const jobs = await seneca.entity('sys/calendar_job').list$({ run_id: second.run_id })
    assert.equal(jobs.length, 0)

    await seneca.close()
  })

  test('progress is per segment, not a spinner', async () => {
    const seneca = await makeSeneca()
    const out = await enqueue(seneca)

    const before = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
    assert.equal(before.run.state, 'running')
    assert.ok(0 < before.states.pending)
    // Each entry names its own segment, so the organiser can see WHICH.
    assert.ok(before.jobs.every((j: any) => j.fixture_id && j.action && j.uid))

    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })

    const after = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
    assert.equal(after.run.state, 'done')
    assert.equal(after.states.pending, undefined)
    assert.ok(0 < after.states.sent)
    assert.ok(0 < after.run.t_end)

    await seneca.close()
  })

  test('a failure is isolated: the other jobs still go', async () => {
    const seneca = await makeSeneca()
    const out = await enqueue(seneca)

    fakeState.failNext = 'create'
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })

    const run = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
    assert.equal(run.states.pending, 1, 'the failure did not stay isolated')
    assert.ok(1 < run.states.sent, 'one rejection took the others down with it')
    // Still open, because something is still retriable.
    assert.equal(run.run.state, 'running')

    await seneca.close()
  })

  test('retry is backed off, and draining does not defeat it', async () => {
    const c = clock()
    // rand() fixed, so the jitter is a known multiplier rather than a range.
    const seneca = await makeSeneca({ now: c.now, rand: () => 0, backoff_base: 1000 })

    const out = await enqueue(seneca)
    fakeState.failNext = 'create'
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })

    const after = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
    const job = after.jobs.find((j: any) => 'pending' === j.state)
    // rand()=0 gives the 50% floor of the jitter window: 1000 * 0.5.
    assert.equal(job.next_at, c.now() + 500)
    assert.equal(job.attempts, 1)

    // Draining again must NOT retry it - that would defeat the backoff it was
    // just given, and hammer a provider that has already said no.
    const calls = fakeState.calls.length
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
    assert.equal(fakeState.calls.length, calls, 'a backed-off job was retried early')

    // Once the clock passes next_at, it goes.
    c.advance(600)
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
    const done = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
    assert.equal(done.states.pending, undefined)
    assert.equal(done.run.state, 'done')

    await seneca.close()
  })

  test('backoff is exponential and jittered, never a fixed interval', async () => {
    const c = clock()
    let r = 0
    const seneca = await makeSeneca({
      now: c.now, rand: () => r, backoff_base: 1000, max_attempts: 9,
    })

    const out = await enqueue(seneca)
    const delays: number[] = []
    for (const jitter of [0, 1, 0]) {
      r = jitter
      fakeState.failNext = 'create'
      const t0 = c.now()
      await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
      const run = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
      const job = run.jobs.find((j: any) => 'pending' === j.state)
      if (job) delays.push(job.next_at - t0)
      c.advance(60 * 60 * 1000)
    }

    // 1000*0.5, then 2000*1.0, then 4000*0.5 - doubling, and the jitter
    // visibly moves it. A provider that rejected a hundred jobs at once must
    // not get all hundred retries back in the same instant.
    assert.deepEqual(delays, [500, 2000, 2000])

    await seneca.close()
  })

  test('a job is abandoned after max attempts, not retried for ever', async () => {
    const c = clock()
    const seneca = await makeSeneca({ now: c.now, rand: () => 0, backoff_base: 1, max_attempts: 3 })

    const out = await enqueue(seneca)
    for (let i = 0; i < 4; i++) {
      fakeState.failNext = 'create'
      await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
      c.advance(10_000)
    }

    const run = await seneca.post('sys:calendar,get:run', { run_id: out.run_id })
    assert.equal(run.states.abandoned, 1)
    // The organiser can SEE it. "Failures surface" (C9) means a state and a
    // reason, not a silent give-up.
    const dead = run.jobs.find((j: any) => 'abandoned' === j.state)
    assert.equal(dead.attempts, 3)
    assert.equal(dead.last_error, 'provider-rejected')
    // And the run says it did not finish cleanly.
    assert.equal(run.run.state, 'aborted')

    await seneca.close()
  })

  test('the job carries the CONFIRMED item, not one recomputed later', async () => {
    const seneca = await makeSeneca()
    const out = await enqueue(seneca)

    // Somebody saves a fixture between confirmation and execution. What was
    // confirmed (C4) is what must go - a plan recomputed at execution time
    // would quietly send something nobody agreed to.
    const seg = await seneca.entity('cag/fixture').load$('demo_open')
    seg.title = 'Retitled after the organiser confirmed'
    await seg.save$()

    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })

    const job = (await seneca.entity('sys/calendar_job').list$({ run_id: out.run_id }))
      .map((r: any) => r.data$(false))
      .find((j: any) => 'demo_open' === j.fixture_id)
    const item = JSON.parse(job.item_json)
    assert.ok(!item.spec.title.includes('Retitled'), 'the job picked up a later edit')

    // The change is not lost - it is simply the NEXT run's business.
    const next = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    assert.ok(next.items.some((i: any) => 'update' === i.action && 'demo_open' === i.fixture_id))

    await seneca.close()
  })

  test('C10 - a second run is refused while one is still running', async () => {
    const seneca = await makeSeneca()

    const first = await enqueue(seneca)
    assert.equal(first.ok, true)

    // The advisory lock is already released - it only guards the create. What
    // refuses here is the RUN ROW, which is the half that survives a restart.
    const second = await enqueue(seneca)
    assert.equal(second.ok, false)
    assert.equal(second.why, 'sync-in-progress')

    await seneca.post('sys:calendar,drain:run', { run_id: first.run_id })

    const third = await enqueue(seneca)
    assert.equal(third.ok, true, 'a finished run still blocked the next one')

    await seneca.close()
  })
})
