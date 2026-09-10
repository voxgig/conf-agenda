import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

// Compiled output, as above.
const { overlaps, isProper } = require('../../dist/lib/overlap.js')

type Interval = { start: number; end: number }

// npm test runs with cwd = backend/, so resolve from there rather than from
// dist-test/ - tsc does not copy .json fixtures into the build output.
const TINY = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'),
)

type Row = Record<string, any>
const rows = (canon: string): Row[] => TINY[canon] as Row[]
const iv = (f: Row): Interval => ({ start: f.t_start, end: f.t_end })

describe('fixture: tiny', () => {
  test('has the shape SPEC 18 specifies', () => {
    const fixtures = rows('cag/fixture')
    const tops = fixtures.filter((f) => null == f.parent_id)
    const segments = fixtures.filter((f) => null != f.parent_id)

    assert.equal(tops.length, 1, 'one conference')
    assert.equal(segments.length, 4, 'four segments')
    assert.equal(rows('cag/room').length, 2, 'two rooms')
    assert.equal(rows('cag/speaker').length, 3)
    assert.equal(rows('cag/appearance').length, 3)
  })

  test('every fixture is proper and inside its parent', () => {
    const fixtures = rows('cag/fixture')
    const byId = new Map(fixtures.map((f) => [f.id, f]))

    for (const f of fixtures) {
      assert.ok(isProper(iv(f)), `${f.id}: t_end must be after t_start`)
      if (null == f.parent_id) continue
      const parent = byId.get(f.parent_id)
      assert.ok(parent, `${f.id}: parent ${f.parent_id} exists`)
      // outside-parent-fixture (SPEC 16.1) must not trigger on this fixture.
      assert.ok(
        f.t_start >= parent!.t_start && f.t_end <= parent!.t_end,
        `${f.id} falls outside ${parent!.id}`,
      )
    }
  })

  test('server-managed fields are consistent', () => {
    for (const f of rows('cag/fixture')) {
      assert.equal(f.org_id, 'org_tiny', `${f.id}: one tenant`)
      // top_id points at the tree root, and the root points at itself.
      assert.equal(f.top_id, 'conf_tiny', `${f.id}: top_id is the conference`)
    }
  })

  test('every reference resolves', () => {
    const ids = (canon: string) => new Set(rows(canon).map((r) => r.id))
    const fixtureIds = ids('cag/fixture')
    const roomIds = ids('cag/room')
    const trackIds = ids('cag/track')
    const speakerIds = ids('cag/speaker')

    for (const f of rows('cag/fixture')) {
      if (f.parent_id) assert.ok(fixtureIds.has(f.parent_id), `${f.id} parent_id`)
      if (f.room_id) assert.ok(roomIds.has(f.room_id), `${f.id} room_id`)
      if (f.track_id) assert.ok(trackIds.has(f.track_id), `${f.id} track_id`)
    }
    for (const a of rows('cag/appearance')) {
      assert.ok(fixtureIds.has(a.fixture_id), `${a.id} fixture_id`)
      assert.ok(speakerIds.has(a.speaker_id), `${a.id} speaker_id`)
    }
  })

  test('carries exactly one room clash - the deliberate one', () => {
    const segments = rows('cag/fixture').filter((f) => null != f.parent_id && f.room_id)

    const clashes: string[] = []
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i]
        const b = segments[j]
        if (a.room_id === b.room_id && overlaps(iv(a), iv(b))) {
          clashes.push([a.id, b.id].sort().join(' + '))
        }
      }
    }

    assert.deepEqual(
      clashes.sort(),
      ['seg_buses + seg_d1edge'],
      'exactly one room-double-booked pair, and it is the intended one',
    )
  })

  test('carries a half-open near-miss that must NOT clash', () => {
    const byId = new Map(rows('cag/fixture').map((f) => [f.id, f]))
    const keynote = byId.get('seg_keynote')!
    const buses = byId.get('seg_buses')!

    // Same room, and the keynote ends at the exact instant the talk starts.
    assert.equal(keynote.room_id, buses.room_id, 'same room')
    assert.equal(keynote.t_end, buses.t_start, 'touching at a shared instant')
    assert.equal(
      overlaps(iv(keynote), iv(buses)),
      false,
      'touching is not overlapping - if this fails, every speaker gets a false clash',
    )
  })

  test('speakers carry the email the presents relation targets', () => {
    for (const s of rows('cag/speaker')) {
      assert.ok(s.name && s.email, `${s.id}: name and email required by $.Speaker`)
    }
  })
})
