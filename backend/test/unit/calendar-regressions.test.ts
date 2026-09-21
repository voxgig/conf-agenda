/* Regressions found reviewing the calendar-ledger branch (PR #17).
 *
 * Every test here failed before the fix beside it, and each one is written to
 * FAIL LOUDLY if the fix is reverted - PLATFORM 10's rule, and the same
 * discipline grid-keys and calendar-sync already follow. None of the 176
 * tests that existed at the time caught any of these, which is the reason
 * this file is separate: it is a record of what the suite could not see.
 *
 * The two that matter most - a plan that cancels the conference, and a queue
 * that sends twice - are both DUPLICATE-INVITATION paths, which is the exact
 * failure this whole subsystem exists to prevent.
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
const { redactText, REDACTED } = require('../../dist/lib/redact.js')
const { inviteSubject } = require('../../dist/lib/invite.js')

const DEMO = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/demo/demo.json'), 'utf8'),
)

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

/** A full, settled sync of the whole conference. */
async function syncAll(seneca: any) {
  const out = await seneca.post('sys:calendar,apply:sync',
    { fixture_id: 'demo_conf', confirm: true })
  assert.equal(out.ok, true, 'apply:sync refused: ' + out.why)
  await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
  return out.run_id
}

const countBy = (items: any[], key = 'action') =>
  items.reduce((acc: Record<string, number>, i: any) => {
    acc[i[key]] = (acc[i[key]] || 0) + 1
    return acc
  }, {})


describe('regression: a plan is scoped to the CONFERENCE, not to what was asked for', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  // THE BUG: planFor resolved the tree from `fixture_id` but loaded links by
  // `top_id`. resolve:tree returns only the requested node and ITS SUBTREE,
  // so planning from a day left every other day's segments out of `byId` -
  // and the VANISHED loop then read their links as `segment-deleted`.
  //
  // aim:web,on:cag,apply:sync takes fixture_id straight from the browser, so
  // this withdrew live meetings from speakers' calendars.
  //
  // TO SEE IT FAIL: restore `tree.nodes.find(n => n.id === fixture_id)` as
  // `top` and drop the re-resolve from top_id.
  test('planning from a DAY cancels nothing', async () => {
    const seneca = await makeSeneca()
    await syncAll(seneca)

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_day1' })
    assert.equal(plan.ok, true, plan.why)

    const counts = countBy(plan.items)
    assert.equal(counts.cancel || 0, 0,
      'a day-scoped plan cancelled the rest of the conference: '
      + JSON.stringify(plan.items.filter((i: any) => 'cancel' === i.action)
        .map((i: any) => i.fixture_id)))
  })

  test('planning from a day is the SAME plan as planning from the conference', async () => {
    const seneca = await makeSeneca()
    await syncAll(seneca)

    const fromTop = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const fromDay = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_day1' })

    assert.equal(fromDay.top_id, 'demo_conf', 'the plan is not conference-scoped')
    assert.deepEqual(countBy(fromDay.items), countBy(fromTop.items))
  })

  // THE SECOND HALF of the same bug, and it is separately expensive. `top`
  // supplies the TIMEZONE, the slug and the title. demo_day1 has no t_tzn, so
  // buildSpec fell back to UTC, every hash differed, and every segment planned
  // as `hash-changed` - re-inviting every speaker to an event that had not
  // moved. A no-op plan is the whole of C2.
  test('a day-scoped plan does not re-invite everybody on a timezone fallback', async () => {
    const seneca = await makeSeneca()
    await syncAll(seneca)

    const plan = await seneca.post('sys:calendar,plan:sync', { fixture_id: 'demo_day1' })
    const counts = countBy(plan.items)

    assert.equal(counts.update || 0, 0,
      'segments replanned as updates without changing: '
      + JSON.stringify(plan.items.filter((i: any) => 'update' === i.action)
        .map((i: any) => [i.fixture_id, i.why])))
    assert.ok(0 < (counts.noop || 0), 'nothing was a no-op, so the walk found nothing')
  })
})


describe('regression: the queue CLAIMS a job before sending it', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  // THE BUG: work:queue listed `pending` rows and sent them, writing the row
  // only AFTER the provider returned. Two overlapping calls listed the same
  // rows and both sent. The local tick is a 1s setInterval, so any provider
  // call slower than a tick overlapped itself.
  //
  // TO SEE IT FAIL: delete the claimJob call and send `candidate` directly.
  test('two concurrent workers send each invitation exactly ONCE', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: 'demo_conf', confirm: true })
    assert.equal(out.ok, true, out.why)

    const jobs = await seneca.entity('sys/calendar_job').list$({ run_id: out.run_id })
    assert.ok(0 < jobs.length, 'no jobs were enqueued, so this test proves nothing')

    // Both workers race the same run, which is exactly what the tick did.
    await Promise.all([
      seneca.post('sys:calendar,work:queue', { run_id: out.run_id }),
      seneca.post('sys:calendar,work:queue', { run_id: out.run_id }),
    ])

    const creates = fakeState.calls.filter((c: any) => 'create' === c.op)
    const uids = creates.map((c: any) => c.uid)
    assert.equal(uids.length, new Set(uids).size,
      'the same UID was sent twice: ' + JSON.stringify(uids))

    // And the ledger agrees. A duplicated row is worse than a duplicated
    // send, because after it the ledger no longer knows what went out.
    const links = (await seneca.entity('sys/calendar_link').list$({}))
      .map((r: any) => r.data$(false))
    const ident = links.map((l: any) => l.fixture_id + '/' + l.account_id)
    assert.equal(ident.length, new Set(ident).size,
      'duplicate ledger rows for one (segment x account): ' + JSON.stringify(ident))
  })

  // A claim that never expires turns one crash into a permanently wedged
  // conference - which is the failure the claim was added to prevent,
  // reintroduced by the claim itself.
  //
  // TO SEE IT FAIL: make claimable() return false for any `running` job.
  test('a claim left behind by a dead worker expires', async () => {
    let t = 1_800_000_000_000
    const seneca = await makeSeneca({ now: () => t, claim_ttl: 60_000 })
    const out = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: 'demo_conf', confirm: true })

    // A worker that claimed a job and never came back.
    const job = (await seneca.entity('sys/calendar_job').list$({ run_id: out.run_id }))[0]
    await job.data$({ state: 'running', claim: 'ghost', claim_at: t }).save$()
    const stuck = job.id

    await seneca.post('sys:calendar,work:queue', { run_id: out.run_id })
    let row = await seneca.entity('sys/calendar_job').load$(stuck)
    assert.equal(row.state, 'running', 'a live claim was stolen')

    t += 60_001
    await seneca.post('sys:calendar,work:queue', { run_id: out.run_id })
    row = await seneca.entity('sys/calendar_job').load$(stuck)
    assert.notEqual(row.state, 'running', 'a dead claim wedged the job for ever')
  })
})


describe('regression: one bad row costs one job, not the conference', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  // THE BUG: the send sat bare in the loop, and send:invite requires
  // `account: Object`. A missing account therefore REJECTED, aborting the
  // whole tick before any row was written: every job stayed `pending`, the
  // run never left `running`, and apply:sync's state guard then refused every
  // future sync of that conference with `sync-in-progress`. For ever.
  //
  // TO SEE IT FAIL: remove the try/catch and the null-account branch in
  // settleJob.
  test('a missing calendar account fails its own job and nothing else', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: 'demo_conf', confirm: true })

    await seneca.entity('sys/calendar_account').remove$('acct_fake')

    // It must not throw, which is what aborted the tick.
    const worked = await seneca.post('sys:calendar,work:queue', { run_id: out.run_id })
    assert.equal(worked.ok, true)
    assert.ok(0 < worked.worked, 'no job was even attempted')

    const jobs = (await seneca.entity('sys/calendar_job').list$({ run_id: out.run_id }))
      .map((r: any) => r.data$(false))
    assert.ok(jobs.every((j: any) => 'running' !== j.state),
      'a job was left claimed by a worker that already returned')
    assert.ok(jobs.some((j: any) => /account-missing/.test(j.last_error || '')),
      'the reason never reached the organiser: '
      + JSON.stringify(jobs.map((j: any) => j.last_error)))
  })
})


describe('regression: the ledger gate covers CREATES', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  // THE BUG: the gate returned early whenever `item.link_id` was null - which
  // is always true for a create, because a create is what produces the link.
  // So the backstop was inert on exactly the action that creates provider
  // events, and the case it exists for was the one it could not see: a create
  // whose provider succeeded but reported failure, retried.
  //
  // TO SEE IT FAIL: restore `if (null == item.link_id) return this.prior(msg)`.
  test('a repeated create for an already-linked segment is refused by the ledger', async () => {
    const seneca = await makeSeneca()
    await syncAll(seneca)

    const link = (await seneca.entity('sys/calendar_link').list$({}))
      .map((r: any) => r.data$(false))
      .find((l: any) => 'active' === l.state)
    assert.ok(link, 'nothing was linked, so this test proves nothing')

    const account = (await seneca.entity('sys/calendar_account').load$('acct_fake')).data$(false)
    const before = fakeState.calls.length

    // A hand-built create, exactly as a queue replay would produce - and with
    // NO link_id, which is what made the gate blind.
    const out = await seneca.post('sys:calendar,send:invite', {
      item: {
        action: 'create',
        fixture_id: link.fixture_id,
        account_id: link.account_id,
        uid: link.uid,
        sequence: 0,
        hash: link.content_hash,
        spec: JSON.parse(link.spec_json),
      },
      account,
      run_id: 'replay',
    })

    assert.equal(out.ok, true)
    assert.equal(out.noop, true, 'the gate let a duplicate create through')
    assert.equal(fakeState.calls.length, before, 'a provider call was made anyway')
  })
})


describe('regression: a sync run is reached through its conference', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  // THE BUG: get:run read sys/calendar_run and sys/calendar_job directly, and
  // `sys/` entities are exempt from @seneca/owner by design. run_id arrives
  // from the browser, so a held or guessed id returned another org's segment
  // titles, account names, recipient counts, UIDs and error strings.
  //
  // TO SEE IT FAIL: delete the cag/fixture load and its guard in get:run.
  test('a run whose conference cannot be read is not readable either', async () => {
    const seneca = await makeSeneca()
    const run = await seneca.entity('sys/calendar_run').make$().data$({
      org_id: 'org_other', top_id: 'not_a_fixture_here', state: 'running',
      t_start: 1, t_end: 0, counts_json: '{}',
    }).save$()

    const out = await seneca.post('sys:calendar,get:run', { run_id: run.id })
    assert.equal(out.ok, false, 'a run was read without its conference')
    assert.equal(out.why, 'not-found')
  })
})


describe('regression: the redactor keeps no fragment of what it removed', () => {
  // THE BUG: a replacer's second argument is the first CAPTURE only when the
  // pattern has one. Four of the five shapes have none, so it received the
  // match OFFSET - a number - and `null == p1` was false for any offset. The
  // secret was still removed, which is why the existing test passed, but
  // every redacted last_error on the run screen carried a spurious digit.
  //
  // TO SEE IT FAIL: restore `(m, p1) => (null == p1 ? REDACTED : p1 + REDACTED)`.
  test('a bare secret is replaced exactly, with no leading offset', () => {
    assert.equal(redactText('Bearer abcdefgh1234 rest'), REDACTED + ' rest')
    assert.equal(redactText('token is ya29.abcdefghijklmno end'),
      'token is ' + REDACTED + ' end')
  })

  test('the keep-the-label shape still keeps its label', () => {
    // This one DOES have a capture group, and the label is deliberately kept:
    // "something called token was here" is the useful half.
    assert.equal(redactText('client_secret=abcd1234'), 'client_secret=' + REDACTED)
  })
})


describe('regression: an invitation is titled by its ACTION', () => {
  // THE BUG: the subject keyed off `sequence`. A resurrection is built as a
  // create carrying the tombstone's sequence + 1 - same UID, which is the
  // whole point of never deleting a link - so a speaker with nothing in their
  // calendar was sent "Updated: <talk>".
  //
  // TO SEE IT FAIL: drop `input.action` from inviteSubject.
  const base = {
    spec: { title: 'Ejectable Embeds', uid: 'u1', attendees: [] },
    organiser: { email: 'a@b.c' },
  }

  test('a resurrection reads as an invitation, not an update', () => {
    assert.match(
      inviteSubject({ ...base, sequence: 3, method: 'request', action: 'create' }),
      /^Invitation: /)
  })

  test('a real update still reads as one', () => {
    assert.match(
      inviteSubject({ ...base, sequence: 3, method: 'request', action: 'update' }),
      /^Updated: /)
  })

  test('without an action the sequence still decides', () => {
    // The fallback stays, for callers that do not say.
    assert.match(inviteSubject({ ...base, sequence: 0, method: 'request' }), /^Invitation: /)
    assert.match(inviteSubject({ ...base, sequence: 1, method: 'request' }), /^Updated: /)
  })
})


describe('regression: the outbound budget is released when the RUN ends', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  // THE BUG: release:lock did `runSends.delete(msg.token)`, but runSends is
  // keyed by run_id and a lock token is an unrelated string - so nothing was
  // ever deleted and the Map grew for the life of the process. And the lock
  // is released the moment apply:sync has ENQUEUED, long before the queue
  // sends anything, so even keyed correctly it would have discarded the
  // budget before it was spent.
  //
  // TO SEE IT FAIL: remove the clear:sends post from work:queue's close.
  test('a completed run releases its budget, without anyone asking', async () => {
    // How many sends this conference actually costs, measured rather than
    // assumed - so the cap below is exactly the run's budget and nothing is
    // left over to hide the bug.
    const probe = await makeSeneca()
    const plan = await probe.post('sys:calendar,plan:sync', { fixture_id: 'demo_conf' })
    const sending = plan.items.filter((i: any) => 'noop' !== i.action).length
    assert.ok(0 < sending, 'nothing to send, so this test proves nothing')
    await probe.close()

    resetFake()
    resetSafety()

    const seneca = await makeSeneca({ cap: sending })
    const out = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: 'demo_conf', confirm: true })
    assert.equal(out.ok, true, out.why)

    // The run spends its entire budget and then CLOSES. Nothing in this test
    // posts clear:sends - the queue has to do it.
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
    const run = await seneca.entity('sys/calendar_run').load$(out.run_id)
    assert.notEqual(run.state, 'running', 'the run never closed')

    const account = (await seneca.entity('sys/calendar_account').load$('acct_fake'))
      .data$(false)
    const again = await seneca.post('sys:calendar,send:invite', {
      account, run_id: out.run_id,
      item: {
        action: 'create', uid: 'after@y', account_id: 'acct_fake',
        fixture_id: 'f_after', sequence: 0, hash: 'h_after', spec: { attendees: [] },
      },
    })

    // Without the release the counter still reads `sending`, which is the
    // cap, and this is refused. The old code deleted by LOCK TOKEN on a Map
    // keyed by run_id, so it never released anything - and it fired before
    // the queue had sent a thing.
    assert.equal(again.ok, true,
      'the run budget was never released: ' + again.why)

    await seneca.close()
  })
})
