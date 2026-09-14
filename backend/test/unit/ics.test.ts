import { describe, test } from 'node:test'
import assert from 'node:assert'

const { buildIcs, buildCsv, vtimezone, offsetMinutes } = require('../../dist/lib/ics.js')

// Europe/Dublin, November 2027: GMT, no transition in the window.
const NOV = {
  schemaVersion: 1,
  conference: {
    slug: 'tiny-conf-2027', title: 'Tiny Conf 2027', t_tzn: 'Europe/Dublin',
    t_start: 1825230600000, t_end: 1825261200000,
  },
  rooms: [{ id: 'r1', name: 'Room A' }],
  tracks: [{ id: 't1', name: 'Platform' }],
  speakers: [{ id: 'sp1', name: 'Ada Byrne' }],
  sessions: [
    {
      id: 'keynote', title: 'Opening Keynote', kind: 'key', room: 'r1', track: 't1',
      t_start: 1825232400000, t_end: 1825236000000, status: 'confirmed', speakers: ['sp1'],
      desc: 'A talk about things.',
    },
    {
      id: 'gone', title: 'Cancelled Talk', kind: 'tak', room: 'r1',
      t_start: 1825239600000, t_end: 1825243200000, status: 'cancelled', speakers: [],
    },
  ],
}

const lines = (s: string) => s.split('\r\n')

describe('ics feed', () => {
  test('a cancelled session keeps its VEVENT, marked CANCELLED', () => {
    const ics = buildIcs(NOV)
    // SPEC 9.1: never by dropping the VEVENT - a dropped event stays in a
    // subscriber's calendar forever, so silence is the one unacceptable
    // outcome.
    assert.ok(ics.includes('UID:gone@tiny-conf-2027'), 'the event is still there')
    assert.ok(ics.includes('STATUS:CANCELLED'))
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2)
  })

  test('carries a VTIMEZONE derived from t_tzn', () => {
    const ics = buildIcs(NOV)
    assert.ok(ics.includes('BEGIN:VTIMEZONE'))
    assert.ok(ics.includes('TZID:Europe/Dublin'))
    assert.ok(ics.includes('DTSTART;TZID=Europe/Dublin:'), 'times are zone-qualified')
  })

  test('a conference spanning a DST transition falls back to UTC', () => {
    // SPEC 8.3: "A conference spanning a DST transition must work. There is a
    // test fixture and it is not optional." A single-offset VTIMEZONE would
    // put half the programme an hour out; being visibly plain beats being
    // subtly wrong, so the builder emits UTC instants instead.
    const before = Date.UTC(2027, 9, 30, 12, 0) // 30 Oct 2027, IST (+01)
    const after = Date.UTC(2027, 10, 1, 12, 0) // 1 Nov 2027, GMT (+00)
    assert.notEqual(
      offsetMinutes(before, 'Europe/Dublin'),
      offsetMinutes(after, 'Europe/Dublin'),
      'the window really does cross a transition',
    )
    assert.equal(vtimezone('Europe/Dublin', before, after), null)

    const ics = buildIcs({
      ...NOV,
      conference: { ...NOV.conference, t_start: before, t_end: after },
      sessions: [{ ...NOV.sessions[0], t_start: before, t_end: before + 3600000 }],
    })
    assert.ok(!ics.includes('BEGIN:VTIMEZONE'))
    assert.match(ics, /DTSTART:\d{8}T\d{6}Z/, 'UTC instants, unambiguous everywhere')
  })

  test('an unknown zone degrades rather than throwing', () => {
    const ics = buildIcs({ ...NOV, conference: { ...NOV.conference, t_tzn: 'Mars/Olympus' } })
    assert.ok(ics.includes('BEGIN:VCALENDAR'))
  })

  test('no content line exceeds 75 octets', () => {
    const ics = buildIcs({
      ...NOV,
      sessions: [{ ...NOV.sessions[0], desc: 'x'.repeat(400) }],
    })
    for (const l of lines(ics)) {
      assert.ok(Buffer.byteLength(l) <= 75, 'over-long line: ' + l.slice(0, 40))
    }
  })

  test('folding a long description is still one logical line', () => {
    const ics = buildIcs({ ...NOV, sessions: [{ ...NOV.sessions[0], desc: 'y'.repeat(200) }] })
    // Continuation lines start with a single space (RFC 5545).
    const idx = lines(ics).findIndex((l) => l.startsWith('DESCRIPTION:'))
    assert.ok(lines(ics)[idx + 1].startsWith(' '), 'continuation is space-prefixed')
  })

  test('UIDs match the shape the calendar ledger will use', () => {
    // SPEC 10.3: <fixture-id>@<top-fixture-slug>, so a session keeps ONE
    // identity across the feed and any invitation.
    assert.ok(buildIcs(NOV).includes('UID:keynote@tiny-conf-2027'))
  })

  test('byte-identical for identical input (SPEC 17)', () => {
    assert.equal(buildIcs(NOV), buildIcs(NOV))

    // DTSTAMP must be derived from the DATA, not the clock - otherwise the
    // content hash moves and the calendar sync re-sends on every publish.
    // Asserted directly rather than by proxy: it equals the conference start.
    const stamps = [...buildIcs(NOV).matchAll(/DTSTAMP:(\S+)/g)].map((m) => m[1])
    assert.ok(stamps.length > 0)
    assert.ok(stamps.every((x) => x === stamps[0]), 'one stamp for the whole feed')
    assert.equal(stamps[0], '20271103T083000Z', 'the conference start, in UTC')
  })

  test('no speaker email reaches the feed', () => {
    assert.ok(!buildIcs(NOV).includes('@example'))
    assert.ok(!buildIcs(NOV).includes('mailto'))
  })

  test('METHOD is PUBLISH - a feed, not an invitation', () => {
    // Invitations are the calendar-sync path (SPEC 10.4) and carry REQUEST.
    assert.ok(buildIcs(NOV).includes('METHOD:PUBLISH'))
    assert.ok(!buildIcs(NOV).includes('METHOD:REQUEST'))
  })
})

describe('csv feed', () => {
  test('one row per session, local times, header first', () => {
    const rows = buildCsv(NOV).trim().split('\n')
    assert.equal(rows[0], 'id,title,kind,status,date,start,end,room,track,speakers')
    assert.equal(rows.length, 3)
    assert.match(rows[1], /^keynote,Opening Keynote,key,confirmed,2027-11-03,09:00,10:00,Room A,Platform,Ada Byrne$/)
  })

  test('a cancelled session is a row, marked cancelled', () => {
    assert.match(buildCsv(NOV), /Cancelled Talk,tak,cancelled/)
  })

  test('commas and quotes in a title are escaped', () => {
    const csv = buildCsv({
      ...NOV,
      sessions: [{ ...NOV.sessions[0], title: 'Testing, "properly"' }],
    })
    assert.ok(csv.includes('"Testing, ""properly"""'))
  })
})
