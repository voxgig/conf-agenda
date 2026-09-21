/* The sync ledger. SPEC 10.3 and the C-suite in 10.5.
 *
 * ONE TEST PER REQUIREMENT, against the recording fake provider. These are
 * assertions about PROVIDER CALLS, not about return values: "never sends the
 * same invitation twice" is a claim about what left the building, and the only
 * way to check it is to count what the provider was asked to do.
 *
 * This subsystem emails real people. A bug here does not produce a bad build;
 * it produces forty speakers with six invitations each.
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

const DEMO = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/demo/demo.json'), 'utf8'),
)

async function makeSeneca(opts: any = {}) {
  const seneca = Seneca({ legacy: false, timeout: 9999, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca, opts)
  seneca.use(CagSrv)
  await seneca.ready()

  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of DEMO[canon] || []) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }

  // One connected account. `fake` is the only provider that exists at this
  // stage, and that is deliberate: the ledger is proven before Google.
  await seneca.entity('sys/calendar_account').data$({
    id$: 'acct_fake', org_id: 'org_demo', name: 'Demo calendar',
    provider: 'fake', calendar_id: 'primary', secret_ref: 'sekreto:demo',
    status: 'active',
  }).save$()

  return seneca
}


/**
 * apply:sync ENQUEUES; the queue sends (SPEC 10.6). Every assertion about
 * provider calls therefore has to drain the run - which is also the point:
 * the tested path is the real one, not a shortcut around the queue.
 */
async function applyAndDrain(seneca: any, fixture_id: string) {
  const out = await seneca.post('sys:calendar,apply:sync', { fixture_id, confirm: true })
  if (out.ok && out.run_id) {
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
    return { ...out, ...(await seneca.post('sys:calendar,get:run', { run_id: out.run_id })) }
  }
  return out
}

const writes = () => fakeState.calls.length
const opsOf = (op: string) => fakeState.calls.filter((c: any) => op === c.op)


describe('calendar sync: the ledger', () => {
  beforeEach(() => resetFake())

  test('C1 - only effectively-confirmed, non-private, talk-like segments', async () => {
    const seneca = await makeSeneca()

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    assert.equal(plan.ok, true)

    const planned = plan.items.filter((i: any) => 'noop' !== i.action).map((i: any) => i.fixture_id)

    // Talk-like kinds only: the coffee break and lunch are not invitations.
    assert.ok(!planned.includes('demo_coffee'), 'a break is not an invitation')
    assert.ok(!planned.includes('demo_lunch'), 'a meal is not an invitation')
    // The day fixtures group the programme; nobody is invited to a day.
    assert.ok(!planned.includes('demo_day1'))
    // A cancelled talk gets no invitation at all when there is no link yet.
    assert.ok(!planned.includes('demo_undo'), 'cancelled segments are not invited')

    assert.ok(planned.includes('demo_open'))
    assert.ok(planned.includes('demo_workshop'))

    await seneca.close()
  })

  test('C1 - a confirmed talk under a DRAFT day is not invitable', async () => {
    const seneca = await makeSeneca()

    // The talk itself is untouched and still says `confirmed`. Only the day
    // above it changes - which is exactly the case a resolver reading a node's
    // own status would get wrong.
    const day = await seneca.entity('cag/fixture').load$('demo_day1')
    day.status = 'draft'
    await day.save$()

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const planned = plan.items.filter((i: any) => 'noop' !== i.action).map((i: any) => i.fixture_id)

    assert.ok(!planned.includes('demo_open'), 'a confirmed talk under a draft day is not invitable')
    // Day 2 is untouched, so its sessions still are - this is the known-present
    // half, without which the assertion above passes vacuously.
    assert.ok(planned.includes('demo_panel'))

    await seneca.close()
  })

  test('C4 - plan:sync sends NOTHING', async () => {
    const seneca = await makeSeneca()

    await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })

    assert.equal(writes(), 0, 'a dry run touched a provider')
    const links = await seneca.entity('sys/calendar_link').list$({})
    assert.equal(links.length, 0, 'a dry run wrote a ledger row')

    await seneca.close()
  })

  test('C4 - apply:sync refuses without explicit confirmation', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('sys:calendar,apply:sync', { fixture_id: 'demo_conf' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'confirmation-required')
    // And it states the counts that confirmation is being asked for.
    assert.ok(0 < out.recipients)
    assert.ok(0 < out.counts.create)
    assert.equal(writes(), 0)

    await seneca.close()
  })

  test('C2 - a full sync twice writes NOTHING on the second pass', async () => {
    const seneca = await makeSeneca()

    const first = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(first.ok, true)
    const after_first = writes()
    assert.ok(0 < after_first, 'the first pass sent nothing at all')

    const second = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(second.ok, true)

    // THE test. Not "fewer calls" - zero.
    assert.equal(writes(), after_first, 'the second pass called the provider')
    // And nothing was even enqueued: a no-op costs no API call by definition,
    // so it is not a job. A queue full of no-ops hides the real work.
    assert.equal(second.jobs.length, 0, 'the second pass queued work')
    assert.equal(second.run.state, 'done')

    await seneca.close()
  })

  test('C3 - changing a room is ONE update and ZERO creates, same UID', async () => {
    const seneca = await makeSeneca()

    await applyAndDrain(seneca, 'demo_conf')
    // The UID of the segment this test is about - not simply the first create
    // in the run, which is a different session once the plan is sorted.
    const uid = fakeState.calls
      .find((c: any) => 'create' === c.op && c.uid.startsWith('demo_open@')).uid
    resetFake()

    const seg = await seneca.entity('cag/fixture').load$('demo_open')
    seg.room_id = 'dr_studio'
    await seg.save$()

    const out = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(out.ok, true)

    assert.equal(opsOf('create').length, 0, 'a room change created a second invitation')
    assert.equal(opsOf('update').length, 1)
    assert.equal(opsOf('cancel').length, 0)

    const update = opsOf('update')[0]
    // Same UID is what makes it an update IN the speaker's calendar rather
    // than a second entry beside it.
    assert.equal(update.uid, uid)
    assert.equal(update.sequence, 1, 'sequence did not advance')

    await seneca.close()
  })

  test('the hash ignores what a speaker would not notice', async () => {
    const seneca = await makeSeneca()

    await applyAndDrain(seneca, 'demo_conf')
    resetFake()

    // An abstract edit is invisible in a calendar entry. If this re-sent, every
    // incidental save would email everybody.
    const seg = await seneca.entity('cag/fixture').load$('demo_open')
    seg.desc = 'A completely rewritten abstract, at some length.'
    await seg.save$()

    await applyAndDrain(seneca, 'demo_conf')
    assert.equal(writes(), 0, 'an abstract edit re-sent an invitation')

    await seneca.close()
  })

  test('cancellation is checked BEFORE the hash', async () => {
    const seneca = await makeSeneca()

    await applyAndDrain(seneca, 'demo_conf')
    resetFake()

    // demo_panel is confirmed and invited. Cancel it WITHOUT touching start,
    // end, title, room or attendees - so its content hash is unchanged. A
    // reconciliation that compares hashes first no-ops this and leaves the
    // event alive in every panellist's calendar.
    const seg = await seneca.entity('cag/fixture').load$('demo_panel')
    seg.status = 'cancelled'
    await seg.save$()

    const out = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(out.ok, true)

    assert.equal(opsOf('cancel').length, 1, 'a cancellation with an unchanged hash was skipped')
    assert.equal(opsOf('create').length, 0)
    assert.equal(opsOf('update').length, 0)

    // The link is a TOMBSTONE, not a deletion: it is what stops a
    // resurrection creating a duplicate.
    const links = (await seneca.entity('sys/calendar_link').list$({ fixture_id: 'demo_panel' }))
      .map((r: any) => r.data$(false))
    assert.equal(links.length, 1)
    assert.equal(links[0].state, 'cancelled')

    await seneca.close()
  })

  test('C8 - deleting a DAY cancels its talks, it does not strand them', async () => {
    const seneca = await makeSeneca()

    await applyAndDrain(seneca, 'demo_conf')
    const live = (await seneca.entity('sys/calendar_link').list$({ state: 'active' })).length
    assert.ok(1 < live)
    resetFake()

    // Remove the day AND its children, the way a subtree delete would - the
    // links are now the only record that those events exist. A resolver that
    // finds events by walking surviving parent_id chains loses exactly these.
    const doomed = (await seneca.entity('cag/fixture').list$({ parent_id: 'demo_day1' }))
      .map((r: any) => r.id)
    for (const id of doomed) await seneca.entity('cag/fixture').remove$(id)
    await seneca.entity('cag/fixture').remove$('demo_day1')

    const out = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(out.ok, true)

    assert.ok(0 < opsOf('cancel').length, 'deleted segments left orphaned provider events')
    assert.equal(opsOf('create').length, 0)

    // Every provider event for a vanished segment is really cancelled, not
    // merely unreferenced. An orphaned event is a meeting a speaker still
    // turns up to.
    const stranded = [...fakeState.events.values()]
      .filter((e: any) => 'active' === e.state)
      .map((e: any) => e.uid)
      .filter((uid: string) => doomed.some((d: string) => uid.startsWith(d + '@')))
    assert.deepEqual(stranded, [])

    await seneca.close()
  })

  test('C5 - the outbound cap aborts BEFORE the first send', async () => {
    // A cap of two against a conference that wants more.
    const seneca = await makeSeneca({ calendarsync: { cap: 2 } })

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    assert.equal(plan.capped, true)

    const out = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(out.ok, false)
    assert.equal(out.why, 'outbound-cap-exceeded')
    assert.ok(2 < out.would_send)

    // BEFORE the first send. A cap checked inside the loop has already sent
    // ninety-nine invitations by the time it trips.
    assert.equal(writes(), 0, 'the cap tripped after sending')
    assert.equal((await seneca.entity('sys/calendar_link').list$({})).length, 0)

    await seneca.close()
  })

  test('C9 - a provider rejection is recorded, not swallowed', async () => {
    const seneca = await makeSeneca()

    fakeState.failNext = 'create'
    const out = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(out.ok, true, 'one rejection abandoned the whole run')

    // The failure is ISOLATED TO ITS JOB (SPEC 10.6). It is still pending,
    // with an attempt recorded and a reason the organiser can read - not
    // swallowed, and not retried instantly.
    const failed = out.jobs.filter((j: any) => 'pending' === j.state)
    assert.equal(failed.length, 1)
    assert.equal(failed[0].attempts, 1)
    assert.equal(failed[0].last_error, 'provider-rejected')
    assert.ok(0 < failed[0].next_at, 'a failed job was not backed off')

    // The others still went. One provider saying no must not silently drop
    // every remaining speaker.
    assert.ok(0 < out.jobs.filter((j: any) => 'sent' === j.state).length)
    // The run stays open while anything is still retriable.
    assert.equal(out.run.state, 'running')

    await seneca.close()
  })

  test('an unknown provider refuses rather than throwing', async () => {
    const seneca = await makeSeneca()
    const acct = await seneca.entity('sys/calendar_account').load$('acct_fake')
    acct.provider = 'google'
    await acct.save$()

    const out = await applyAndDrain(seneca, 'demo_conf')
    assert.equal(out.ok, true)
    assert.ok(0 < out.jobs.length)
    assert.ok(out.jobs.every((j: any) => 'sent' !== j.state))
    assert.ok(out.jobs.every((j: any) => String(j.last_error).startsWith('no-provider')))
    assert.equal(writes(), 0)

    await seneca.close()
  })

  test('two plans over identical data are identical (SPEC 17)', async () => {
    const seneca = await makeSeneca()

    const a = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const b = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items))

    await seneca.close()
  })
})

describe('the plan an organiser reads', () => {
  beforeEach(() => resetFake())

  test('it says WHAT changed, not that a hash differs', async () => {
    const seneca = await makeSeneca()
    await applyAndDrain(seneca, 'demo_conf')

    const seg = await seneca.entity('cag/fixture').load$('demo_open')
    seg.room_id = 'dr_studio'
    seg.t_start = (seg.t_start as number) + 15 * 60 * 1000
    await seg.save$()

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const item = plan.items.find((i: any) => 'demo_open' === i.fixture_id)

    assert.equal(item.action, 'update')
    // "room + start time", not "hash-changed". An organiser shown a hash has
    // been told nothing and will either apply blindly or not at all.
    assert.deepEqual(item.changed.sort(), ['room', 'start time'])

    await seneca.close()
  })

  test('a changed speaker reads as the attendee set', async () => {
    const seneca = await makeSeneca()
    await applyAndDrain(seneca, 'demo_conf')

    const app = (await seneca.entity('cag/appearance').list$({ fixture_id: 'demo_open' }))[0]
    app.speaker_id = 'ds_priya'
    await app.save$()

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const item = plan.items.find((i: any) => 'demo_open' === i.fixture_id)
    assert.deepEqual(item.changed, ['attendee set'])
    assert.deepEqual(item.recipients, ['Priya Nair'])

    await seneca.close()
  })

  test('recipients are NAMES - the screen has no use for an email', async () => {
    const seneca = await makeSeneca()

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const withPeople = plan.items.filter((i: any) => 0 < i.recipients.length)
    assert.ok(0 < withPeople.length)
    for (const i of withPeople) {
      for (const r of i.recipients) {
        assert.ok(!String(r).includes('@'), 'an email reached the plan: ' + r)
      }
    }

    await seneca.close()
  })

  test('the no-op count is carried, because C2 has to be VISIBLE', async () => {
    const seneca = await makeSeneca()
    await applyAndDrain(seneca, 'demo_conf')

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    // "13 further segments - hash unchanged - no-op - zero provider calls" is
    // the line the mockup puts on screen, and it is the only place the
    // organiser ever sees that nothing was sent.
    assert.ok(0 < plan.unchanged)
    assert.equal(plan.unchanged, plan.counts.noop)

    await seneca.close()
  })

  test('the accounts come back WITHOUT their secret refs', async () => {
    const seneca = await makeSeneca()

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    assert.equal(plan.accounts.length, 1)
    assert.equal(plan.accounts[0].provider, 'fake')
    // This object is on its way to a browser (C7).
    assert.equal(plan.accounts[0].secret_ref, undefined)
    assert.ok(!JSON.stringify(plan.accounts).includes('sekreto'))

    await seneca.close()
  })
})
