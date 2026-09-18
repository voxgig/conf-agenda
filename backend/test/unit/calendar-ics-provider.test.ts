/* provider:ics — the first REAL provider. SPEC 10.2, 10.4, C3, C9.
 *
 * The fake provider records calls; this one produces the actual bytes a
 * speaker's calendar client will read. So these assertions are about the FILE,
 * not about return values: an invitation that says the right thing to our own
 * code and the wrong thing to Outlook has not worked.
 *
 * Three fields carry the whole of C3, and each has its own test: UID stable,
 * SEQUENCE advancing, METHOD matching the intent.
 */
import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const { icsOutbox, resetIcsOutbox } = require('../../dist/concern/CalendarSync/IcsProvider.js')
const { resetSafety } = require('../../dist/concern/CalendarSync/CalendarSafety.js')
const { buildInvite, inviteSubject } = require('../../dist/lib/invite.js')

const DEMO = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/demo/demo.json'), 'utf8'),
)

async function makeSeneca(ics: any = { record: true }) {
  const seneca = Seneca({ legacy: false, timeout: 9999, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca, { icsprovider: ics })
  seneca.use(CagSrv)
  await seneca.ready()

  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of DEMO[canon] || []) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  await seneca.entity('sys/calendar_account').data$({
    id$: 'acct_ics', org_id: 'org_demo', name: 'ics by email',
    provider: 'ics', calendar_id: '', secret_ref: '', status: 'active',
  }).save$()
  return seneca
}

async function applyAndDrain(seneca: any, fixture_id = 'demo_conf') {
  const out = await seneca.post('sys:calendar,apply:sync', { fixture_id, confirm: true })
  if (out.ok && out.run_id) {
    await seneca.post('sys:calendar,drain:run', { run_id: out.run_id })
    return { ...out, ...(await seneca.post('sys:calendar,get:run', { run_id: out.run_id })) }
  }
  return out
}

const SPEC = {
  uid: 'seg_x@conf-2027',
  title: 'A Talk; with, punctuation',
  t_start: Date.UTC(2027, 10, 3, 9, 0, 0),
  t_end: Date.UTC(2027, 10, 3, 10, 0, 0),
  t_tzn: 'Europe/Dublin',
  room: 'Main Hall',
  attendees: ['ada@example.invalid', 'mina@example.invalid'],
}

const ORGANISER = { name: 'conf-agenda', email: 'calendar@example.invalid' }

/**
 * Undo RFC 5545 line folding before asserting on CONTENT.
 *
 * An ATTENDEE line is routinely longer than 75 octets, so the file splits it -
 * correctly. A test that looks for the unfolded string in the raw file is
 * testing the folding, not the content, and fails on exactly the invitations
 * that matter most.
 */
const unfold = (ics: string) => ics.split('\r\n ').join('')


describe('the invitation file', () => {
  test('a REQUEST names its attendees and asks them', () => {
    const ics = buildInvite({ spec: SPEC, sequence: 0, method: 'request', organiser: ORGANISER })

    assert.match(ics, /METHOD:REQUEST/)
    assert.match(ics, /STATUS:CONFIRMED/)
    assert.match(ics, /UID:seg_x@conf-2027/)
    assert.match(ics, /SEQUENCE:0/)
    assert.match(ics, /ORGANIZER;CN=conf-agenda:mailto:calendar@example.invalid/)
    // RSVP=TRUE is what turns a notification into an invitation.
    for (const who of SPEC.attendees) {
      assert.ok(unfold(ics).includes('RSVP=TRUE:mailto:' + who), 'not invited: ' + who)
    }
    assert.match(ics, /PARTSTAT=NEEDS-ACTION/)

    // Real timezone blocks, not UTC with the offset baked in.
    assert.match(ics, /BEGIN:VTIMEZONE/)
    assert.match(ics, /DTSTART;TZID=Europe\/Dublin:20271103T090000/)

    // RFC 5545 escaping: semicolons and commas in a SUMMARY are structural.
    assert.ok(unfold(ics).includes('SUMMARY:A Talk\\; with\\, punctuation'))
    // CRLF line endings, per the RFC - some clients reject bare LF.
    assert.ok(ics.includes('\r\n'))
  })

  test('C3 - an update keeps the UID and advances the SEQUENCE', () => {
    const first = buildInvite({ spec: SPEC, sequence: 0, method: 'request', organiser: ORGANISER })
    const moved = { ...SPEC, room: 'Studio' }
    const second = buildInvite({ spec: moved, sequence: 1, method: 'request', organiser: ORGANISER })

    assert.ok(second.includes('UID:' + SPEC.uid), 'the UID changed - that is a second entry')
    assert.match(second, /SEQUENCE:1/)
    assert.ok(first.includes('LOCATION:Main Hall'))
    assert.ok(second.includes('LOCATION:Studio'))

    // A client IGNORES a REQUEST whose SEQUENCE is not greater than the one it
    // holds. A sequence that fails to advance is an update silently dropped,
    // which looks exactly like the product not working.
    assert.notEqual(first, second)
  })

  test('a cancellation is CANCEL and CANCELLED, and still names its attendees', () => {
    const ics = buildInvite({ spec: SPEC, sequence: 2, method: 'cancel', organiser: ORGANISER })

    assert.match(ics, /METHOD:CANCEL/)
    assert.match(ics, /STATUS:CANCELLED/)
    assert.match(ics, /SEQUENCE:2/)
    // A CANCEL addressed to nobody is a cancellation nobody receives.
    assert.ok(unfold(ics).includes('mailto:ada@example.invalid'))
  })

  test('it is deterministic - no clock, no random (SPEC 17)', () => {
    const a = buildInvite({ spec: SPEC, sequence: 0, method: 'request', organiser: ORGANISER })
    const b = buildInvite({ spec: SPEC, sequence: 0, method: 'request', organiser: ORGANISER })
    assert.equal(a, b)
    // DTSTAMP comes from the event, not from now.
    assert.match(a, /DTSTAMP:20271103T090000Z/)
  })

  test('long lines fold at 75 OCTETS, without splitting a character', () => {
    const spec = { ...SPEC, title: 'Café ' + 'ü'.repeat(60) + ' end' }
    const ics = buildInvite({ spec, sequence: 0, method: 'request', organiser: ORGANISER })

    for (const line of ics.split('\r\n')) {
      assert.ok(76 > Buffer.from(line, 'utf8').length, 'unfolded line: ' + line.slice(0, 40))
    }
    // A character split across the fold produces a file some clients silently
    // reject, and "the invitation never arrived" is indistinguishable from
    // "we never sent it". Round-tripping proves nothing was mangled.
    const unfolded = ics.split('\r\n ').join('')
    assert.ok(unfolded.includes('ü'.repeat(60)))
  })

  test('the subject says which of the three things happened', () => {
    const base = { spec: SPEC, organiser: ORGANISER, conference: 'Demo Conf 2027' }
    assert.match(inviteSubject({ ...base, sequence: 0, method: 'request' }), /^Invitation: /)
    assert.match(inviteSubject({ ...base, sequence: 1, method: 'request' }), /^Updated: /)
    assert.match(inviteSubject({ ...base, sequence: 2, method: 'cancel' }), /^Cancelled: /)
  })
})


describe('provider:ics through the ledger', () => {
  beforeEach(() => { resetIcsOutbox(); resetSafety() })

  test('a sync produces real invitations, one per segment', async () => {
    const seneca = await makeSeneca()
    const run = await applyAndDrain(seneca)

    assert.equal(run.ok, true)
    assert.ok(0 < icsOutbox.sent.length)
    assert.ok(run.jobs.every((j: any) => 'sent' === j.state), JSON.stringify(run.states))

    for (const mail of icsOutbox.sent) {
      assert.match(mail.ics, /METHOD:REQUEST/)
      assert.match(mail.subject, /^Invitation: /)
      assert.ok(0 < mail.to.length)
    }

    await seneca.close()
  })

  test('C2 - a second sync produces no mail at all', async () => {
    const seneca = await makeSeneca()
    await applyAndDrain(seneca)
    const first = icsOutbox.sent.length
    assert.ok(0 < first)

    resetIcsOutbox()
    await applyAndDrain(seneca)
    assert.equal(icsOutbox.sent.length, 0, 'the second sync emailed everybody again')

    await seneca.close()
  })

  test('C3 - a room change is ONE update, same UID, SEQUENCE 1', async () => {
    const seneca = await makeSeneca()
    await applyAndDrain(seneca)
    const created = icsOutbox.sent.find((m: any) => m.uid.startsWith('demo_open@'))
    assert.ok(created)
    assert.equal(created.sequence, 0)
    resetIcsOutbox()

    const seg = await seneca.entity('cag/fixture').load$('demo_open')
    seg.room_id = 'dr_studio'
    await seg.save$()
    await applyAndDrain(seneca)

    assert.equal(icsOutbox.sent.length, 1)
    const update = icsOutbox.sent[0]
    assert.equal(update.uid, created.uid, 'the UID changed - a second entry in every calendar')
    assert.equal(update.sequence, 1)
    assert.match(update.ics, /METHOD:REQUEST/)
    assert.match(update.subject, /^Updated: /)
    assert.ok(unfold(update.ics).includes('LOCATION:Studio'))

    await seneca.close()
  })

  test('a cancellation reaches the people who were INVITED', async () => {
    const seneca = await makeSeneca()
    await applyAndDrain(seneca)
    const invited = icsOutbox.sent.find((m: any) => m.uid.startsWith('demo_panel@'))
    assert.ok(invited)
    resetIcsOutbox()

    // Cancel it, and strip its appearances - which is what deleting a speaker
    // row would do. The live segment no longer says who to tell; only the
    // link's stored spec does.
    for (const a of await seneca.entity('cag/appearance').list$({ fixture_id: 'demo_panel' })) {
      await seneca.entity('cag/appearance').remove$(a.id)
    }
    const seg = await seneca.entity('cag/fixture').load$('demo_panel')
    seg.status = 'cancelled'
    await seg.save$()

    await applyAndDrain(seneca)

    assert.equal(icsOutbox.sent.length, 1)
    const cancel = icsOutbox.sent[0]
    assert.match(cancel.ics, /METHOD:CANCEL/)
    assert.equal(cancel.uid, invited.uid)
    // THE POINT: the recipients come from the link, not the live segment.
    assert.deepEqual(cancel.to.slice().sort(), invited.to.slice().sort())

    await seneca.close()
  })

  test('C9 - with no deliverer, nothing reports SENT', async () => {
    // The default seam refuses. A provider that builds a file and drops it on
    // the floor while reporting success is the exact lie C9 exists to prevent.
    const seneca = await makeSeneca({ record: false })

    const run = await applyAndDrain(seneca)
    assert.equal(run.ok, true)
    assert.equal(icsOutbox.sent.length, 0)
    assert.ok(run.jobs.every((j: any) => 'sent' !== j.state), 'a dropped invitation reported sent')
    assert.ok(run.jobs.every((j: any) => 'no-deliverer-configured' === j.last_error))

    await seneca.close()
  })

  test('an invitation with no recipient is not a success', async () => {
    const seneca = await makeSeneca()
    // A confirmed talk whose only speaker has no email address.
    const speaker = await seneca.entity('cag/speaker').load$('ds_lea')
    speaker.email = ''
    await speaker.save$()

    const run = await applyAndDrain(seneca)
    const workshop = run.jobs.find((j: any) => 'demo_workshop' === j.fixture_id)
    assert.ok(workshop)
    assert.notEqual(workshop.state, 'sent', 'an invitation to nobody reported sent')
    assert.equal(workshop.last_error, 'no-recipients')

    await seneca.close()
  })
})
