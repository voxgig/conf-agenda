/* The safety chain and the lock. SPEC 10.5 C5, C7, C10.
 *
 * These test WHERE the rules sit, not only that they work. The whole design
 * claim is that a provider written years from now inherits them without its
 * author doing anything - so the tests reach past apply:sync and post
 * send:invite directly, which is what a retry, a queue replay or a future
 * scheduler would do.
 */
import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
// From dist, like every other module here: test/ has its own rootDir, so a
// direct import of src/ is outside it.
const { redact, redactText, redactReason, REDACTED } = require('../../dist/lib/redact.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const { fakeState, resetFake } = require('../../dist/concern/CalendarSync/FakeProvider.js')
const { resetSafety } = require('../../dist/concern/CalendarSync/CalendarSafety.js')

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
  await seneca.entity('sys/calendar_account').data$({
    id$: 'acct_fake', org_id: 'org_demo', name: 'Demo calendar',
    provider: 'fake', calendar_id: 'primary', secret_ref: 'sekreto:demo',
    status: 'active',
  }).save$()
  return seneca
}


describe('C7 - the redactor', () => {
  // A unit test, because this is the one piece that has to hold for input
  // nobody anticipated. The threat is not a developer logging a secret on
  // purpose; it is a provider SDK error that embeds the request it failed on.

  test('bearer tokens, OAuth grants and JWTs are scrubbed on sight', () => {
    const cases = [
      'Request failed: Authorization: Bearer ya29.a0AfH6SMBx7jQ9_notarealtoken123',
      'refresh_token=1//0gK9xnotarealrefreshtokenvalue',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g',
      'client_secret: GOCSPX-notarealclientsecret99',
    ]
    for (const c of cases) {
      const out = redactText(c)
      assert.ok(out.includes(REDACTED), 'not redacted: ' + c)
      assert.ok(!/ya29\.|1\/\/0gK|eyJhbGci|GOCSPX-/.test(out), 'secret survived: ' + out)
    }
  })

  test('a key whose NAME is secret loses its value, whatever it looks like', () => {
    const out: any = redact({
      url: 'https://api.example.test/events',
      headers: { authorization: 'anything at all', 'x-api-key': 'plainish' },
      access_token: 'short',
    })
    assert.equal(out.headers.authorization, REDACTED)
    assert.equal(out.headers['x-api-key'], REDACTED)
    assert.equal(out.access_token, REDACTED)
    // And the innocent field is untouched - a redactor that scrubs everything
    // makes errors useless and gets switched off.
    assert.equal(out.url, 'https://api.example.test/events')
  })

  test('an Error keeps its message and LOSES its stack', () => {
    const err = new Error('failed with Bearer ya29.a0AfH6SMnotarealtoken')
    const out: any = redact(err)
    assert.ok(out.message.includes(REDACTED))
    assert.equal(out.stack, undefined, 'a stack is how a request body reaches a log')
  })

  test('it is idempotent and survives a cyclic object', () => {
    const once = redactReason('Bearer ya29.a0AfH6SMnotarealtoken')
    assert.equal(redactReason(once), once)

    const cyclic: any = { name: 'x' }
    cyclic.self = cyclic
    assert.doesNotThrow(() => redact(cyclic))
  })
})


describe('the safety chain sits above the dispatch', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  test('C2 - the ledger gate refuses a stale send posted DIRECTLY', async () => {
    const seneca = await makeSeneca()
    await seneca.post('sys:calendar,apply:sync', { fixture_id: 'demo_conf', confirm: true })

    const link = (await seneca.entity('sys/calendar_link').list$({ state: 'active' }))
      .map((r: any) => r.data$(false))[0]
    const account = (await seneca.entity('sys/calendar_account').load$('acct_fake')).data$(false)
    resetFake()

    // A replayed job: the same item apply:sync already sent. apply:sync is not
    // in the picture here - a retry or a queue replay would look exactly like
    // this, and the ledger rather than the caller is the authority.
    const out = await seneca.post('sys:calendar,send:invite', {
      account,
      item: {
        action: 'update', fixture_id: link.fixture_id, account_id: link.account_id,
        uid: link.uid, title: 't', sequence: link.sequence + 1,
        hash: link.content_hash, why: 'replay', link_id: link.id,
        provider_event_id: link.provider_event_id, spec: { attendees: [] },
      },
    })

    assert.equal(out.ok, true)
    assert.equal(out.noop, true)
    assert.equal(fakeState.calls.length, 0, 'a replay reached the provider')

    await seneca.close()
  })

  test('C7 - a provider error is redacted before it leaves send:invite', async () => {
    const seneca = await makeSeneca()

    // A provider that fails with a token in its message - the ordinary shape
    // of an SDK error, and the one nobody writes on purpose.
    // No second ready() here: the instance has already fired it once, and
    // awaiting it again never resolves.
    seneca.message('sys:calendar,provider:leaky,create:extevent', async function () {
      return { ok: false, why: 'HTTP 401: Authorization: Bearer ya29.a0AfH6SMnotarealtoken' }
    })

    const out = await seneca.post('sys:calendar,send:invite', {
      account: { id: 'acct_leaky', provider: 'leaky' },
      item: { action: 'create', uid: 'x@y', account_id: 'acct_leaky', sequence: 0, hash: 'h' },
    })

    assert.equal(out.ok, false)
    assert.ok(out.why.includes(REDACTED))
    assert.ok(!out.why.includes('ya29.'), 'a token left send:invite: ' + out.why)

    await seneca.close()
  })

  test('C7 - and it reaches the LEDGER ROW, not just the return value', async () => {
    const seneca = await makeSeneca()
    await seneca.post('sys:calendar,apply:sync', { fixture_id: 'demo_conf', confirm: true })

    // Break the provider with a leaky error, then force a real update.
    const seg = await seneca.entity('cag/fixture').load$('demo_open')
    seg.room_id = 'dr_studio'
    await seg.save$()
    fakeState.failNext = 'update'

    await seneca.post('sys:calendar,apply:sync', { fixture_id: 'demo_conf', confirm: true })

    const errored = (await seneca.entity('sys/calendar_link').list$({}))
      .map((r: any) => r.data$(false))
      .filter((l: any) => l.last_error)
    assert.ok(0 < errored.length, 'the failure was not recorded at all (C9)')
    for (const l of errored) {
      assert.ok(!/ya29\.|Bearer /.test(String(l.last_error)),
        'a row anyone who can read the org can read carries a token')
    }

    await seneca.close()
  })

  test('C5 - the cap refuses at send:invite too, not only on the plan', async () => {
    const seneca = await makeSeneca({ calendarsync: { cap: 1 } })
    const account = (await seneca.entity('sys/calendar_account').load$('acct_fake')).data$(false)

    const send = (n: number) => seneca.post('sys:calendar,send:invite', {
      account, run_id: 'run_a',
      item: {
        action: 'create', uid: 'u' + n + '@y', account_id: 'acct_fake',
        fixture_id: 'f' + n, sequence: 0, hash: 'h' + n, spec: { attendees: [] },
      },
    })

    assert.equal((await send(1)).ok, true)
    const second = await send(2)
    assert.equal(second.ok, false)
    assert.equal(second.why, 'outbound-cap-exceeded')
    // It REFUSED rather than truncating silently: a half-sent run is worse
    // than a refused one, because nobody can tell which half went.
    assert.equal(fakeState.calls.length, 1)

    await seneca.close()
  })
})


describe('C10 - one sync at a time per conference', () => {
  beforeEach(() => { resetFake(); resetSafety() })

  test('a second run is refused while the first holds the lock', async () => {
    const seneca = await makeSeneca()

    const lock = await seneca.post('sys:calendar,acquire:lock', { top_id: 'demo_conf' })
    assert.equal(lock.ok, true)

    const out = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: 'demo_conf', confirm: true })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'sync-in-progress')
    assert.equal(fakeState.calls.length, 0, 'a concurrent run reached the provider')

    await seneca.post('sys:calendar,release:lock', { top_id: 'demo_conf', token: lock.token })
    const after = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: 'demo_conf', confirm: true })
    assert.equal(after.ok, true, 'the lock was never released')

    await seneca.close()
  })

  test('the lock is released even when the run fails', async () => {
    const seneca = await makeSeneca()

    fakeState.failNext = 'create'
    await seneca.post('sys:calendar,apply:sync', { fixture_id: 'demo_conf', confirm: true })

    // A run that leaves the conference locked would lock it out until the TTL.
    const lock = await seneca.post('sys:calendar,acquire:lock', { top_id: 'demo_conf' })
    assert.equal(lock.ok, true, 'the lock survived the run')

    await seneca.close()
  })

  test('only the holder can release', async () => {
    const seneca = await makeSeneca()

    const lock = await seneca.post('sys:calendar,acquire:lock', { top_id: 'demo_conf' })
    const bad = await seneca.post('sys:calendar,release:lock',
      { top_id: 'demo_conf', token: 'someone-elses-token' })
    assert.equal(bad.ok, false)
    assert.equal(bad.why, 'not-holder')

    // Still held. A release that ignored the token would let a timed-out run
    // unlock the run that replaced it, and then both are live - which is the
    // duplicate-invitation path C10 exists to close.
    const second = await seneca.post('sys:calendar,acquire:lock', { top_id: 'demo_conf' })
    assert.equal(second.ok, false)

    await seneca.post('sys:calendar,release:lock', { top_id: 'demo_conf', token: lock.token })
    await seneca.close()
  })

  test('a stale lock expires, so one crash does not lock a conference for ever', async () => {
    const seneca = await makeSeneca({ calendarsync: { lock_ttl: 1 } })

    await seneca.post('sys:calendar,acquire:lock', { top_id: 'demo_conf' })
    await new Promise((r) => setTimeout(r, 5))

    const again = await seneca.post('sys:calendar,acquire:lock', { top_id: 'demo_conf' })
    assert.equal(again.ok, true)

    await seneca.close()
  })
})
