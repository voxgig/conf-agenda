import { describe, test } from 'node:test'
import assert from 'node:assert'

const { speakerDoubleBooked } = require('../../dist/lib/validate/speaker_double_booked.js')
const { treeShape } = require('../../dist/lib/validate/tree_shape.js')
const { references } = require('../../dist/lib/validate/references.js')
const { warnings } = require('../../dist/lib/validate/warnings.js')

const T = (h: number, m = 0) => 1825200000000 + h * 3600000 + m * 60000

// SPEC 18: one triggering fixture and one NON-TRIGGERING NEAR-MISS per rule.
// The near-miss is the half that stops a rule being over-eager - an error that
// fires when it should not blocks a real conference from publishing.
function input(over: any = {}) {
  return {
    top: {
      id: 'conf', org_id: 'o1', kind: 'con', title: 'Conf', slug: 'c',
      t_start: T(8), t_end: T(18), effective_status: 'confirmed',
    },
    segments: [],
    rooms: [{ id: 'r1', org_id: 'o1', name: 'Room One', capacity: 50 }],
    tracks: [{ id: 't1', org_id: 'o1', name: 'Track' }],
    speakers: [{ id: 'sp1', org_id: 'o1', name: 'Ada', email: 'a@x.invalid' }],
    appearances: [],
    ...over,
  }
}
const seg = (o: any) => ({
  parent_id: 'conf', org_id: 'o1', kind: 'tak', effective_status: 'confirmed',
  desc: 'An abstract.', ...o,
})
const rules = (d: any[]) => d.map((x) => x.rule)

describe('rule: speaker-double-booked', () => {
  test('TRIGGERS when one speaker is in two overlapping sessions', () => {
    const out = speakerDoubleBooked(input({
      segments: [
        seg({ id: 'a', title: 'A', t_start: T(10), t_end: T(11) }),
        seg({ id: 'b', title: 'B', t_start: T(10, 30), t_end: T(12) }),
      ],
      appearances: [
        { id: 'x', fixture_id: 'a', speaker_id: 'sp1' },
        { id: 'y', fixture_id: 'b', speaker_id: 'sp1' },
      ],
    }))
    assert.equal(out.length, 1)
    assert.match(out[0].message, /Ada is in two overlapping sessions/)
    // Both sides named, plus the speaker (SPEC 16.3).
    assert.deepEqual(
      out[0].related.filter((r: any) => 'cag/fixture' === r.canon).map((r: any) => r.id).sort(),
      ['a', 'b'],
    )
  })

  test('near-miss: adjacent sessions do not trigger', () => {
    const out = speakerDoubleBooked(input({
      segments: [
        seg({ id: 'a', t_start: T(10), t_end: T(11) }),
        seg({ id: 'b', t_start: T(11), t_end: T(12) }),
      ],
      appearances: [
        { id: 'x', fixture_id: 'a', speaker_id: 'sp1' },
        { id: 'y', fixture_id: 'b', speaker_id: 'sp1' },
      ],
    }))
    assert.deepEqual(out, [])
  })

  test('a cancelled session cannot double-book a speaker', () => {
    const out = speakerDoubleBooked(input({
      segments: [
        seg({ id: 'a', t_start: T(10), t_end: T(11) }),
        seg({ id: 'b', t_start: T(10), t_end: T(11), effective_status: 'cancelled' }),
      ],
      appearances: [
        { id: 'x', fixture_id: 'a', speaker_id: 'sp1' },
        { id: 'y', fixture_id: 'b', speaker_id: 'sp1' },
      ],
    }))
    assert.deepEqual(out, [])
  })
})

describe('rule: outside-parent-fixture / negative-duration / bad-parent-kind', () => {
  test('TRIGGERS when a session falls outside its conference', () => {
    const out = treeShape(input({
      segments: [seg({ id: 'late', title: 'Late', t_start: T(17), t_end: T(19) })],
    }))
    assert.ok(rules(out).includes('outside-parent-fixture'))
    assert.match(out[0].message, /ends too late/)
  })

  test('near-miss: a session exactly filling its parent does not trigger', () => {
    const out = treeShape(input({
      segments: [seg({ id: 'exact', t_start: T(8), t_end: T(18) })],
    }))
    assert.ok(!rules(out).includes('outside-parent-fixture'))
  })

  test('TRIGGERS on a zero-length session, and on end-before-start', () => {
    const zero = treeShape(input({ segments: [seg({ id: 'z', t_start: T(10), t_end: T(10) })] }))
    assert.ok(rules(zero).includes('negative-duration'))
    const back = treeShape(input({ segments: [seg({ id: 'b', t_start: T(11), t_end: T(10) })] }))
    assert.ok(rules(back).includes('negative-duration'))
  })

  test('near-miss: a one-minute session is fine', () => {
    const out = treeShape(input({
      segments: [seg({ id: 'tiny', t_start: T(10), t_end: T(10, 1) })],
    }))
    assert.ok(!rules(out).includes('negative-duration'))
  })

  test('TRIGGERS when a conference kind has a parent, or a segment has none', () => {
    const nested = treeShape(input({
      segments: [seg({ id: 'inner', kind: 'con', t_start: T(9), t_end: T(10) })],
    }))
    assert.ok(rules(nested).includes('bad-parent-kind'))
    assert.match(nested[0].message, /top-level kind but has a parent/)
  })

  test('TRIGGERS when a day is not directly under a conference', () => {
    const out = treeShape(input({
      segments: [
        seg({ id: 'talk', kind: 'tak', t_start: T(9), t_end: T(10) }),
        seg({ id: 'day', kind: 'day', parent_id: 'talk', t_start: T(9), t_end: T(10) }),
      ],
    }))
    assert.ok(rules(out).includes('bad-parent-kind'))
  })

  test('TRIGGERS when a segment contains children', () => {
    const out = treeShape(input({
      segments: [
        seg({ id: 'talk', kind: 'tak', t_start: T(9), t_end: T(11) }),
        seg({ id: 'sub', kind: 'tak', parent_id: 'talk', t_start: T(9), t_end: T(10) }),
      ],
    }))
    assert.ok(out.some((d: any) => /contains other fixtures/.test(d.message)))
  })

  test('near-miss: conference > day > talk is the legal shape', () => {
    const out = treeShape(input({
      segments: [
        seg({ id: 'day1', kind: 'day', t_start: T(9), t_end: T(17) }),
        seg({ id: 'talk', kind: 'tak', parent_id: 'day1', t_start: T(10), t_end: T(11) }),
      ],
    }))
    assert.deepEqual(out, [], 'the shape the spec describes must not be flagged')
  })

  test('an unknown kind is refused', () => {
    const out = treeShape(input({
      segments: [seg({ id: 'x', kind: 'banquet', t_start: T(9), t_end: T(10) })],
    }))
    assert.ok(rules(out).includes('bad-parent-kind'))
  })
})

describe('rule: unknown-reference / cross-tenant-reference', () => {
  test('TRIGGERS on a room that does not exist', () => {
    const out = references(input({
      segments: [seg({ id: 'a', room_id: 'ghost', t_start: T(9), t_end: T(10) })],
    }))
    assert.ok(rules(out).includes('unknown-reference'))
    assert.match(out[0].message, /room that does not exist/)
  })

  test('TRIGGERS on a room belonging to another organisation', () => {
    // Existence is not enough: a user with access to two orgs must not graft
    // one org's tree onto another's room (SPEC 16.1).
    const out = references(input({
      rooms: [{ id: 'r1', org_id: 'OTHER', name: 'Their Room' }],
      segments: [seg({ id: 'a', room_id: 'r1', t_start: T(9), t_end: T(10) })],
    }))
    assert.ok(rules(out).includes('cross-tenant-reference'))
  })

  test('near-miss: a room in this org, that exists, is fine', () => {
    const out = references(input({
      segments: [seg({ id: 'a', room_id: 'r1', track_id: 't1', t_start: T(9), t_end: T(10) })],
    }))
    assert.deepEqual(out, [])
  })

  test('appearances are checked too, both ends', () => {
    const out = references(input({
      segments: [seg({ id: 'a', t_start: T(9), t_end: T(10) })],
      appearances: [{ id: 'x', org_id: 'o1', fixture_id: 'a', speaker_id: 'ghost' }],
    }))
    assert.ok(rules(out).includes('unknown-reference'))
  })
})

describe('warnings', () => {
  test('no-speaker and missing-abstract trigger on a talk', () => {
    const out = warnings(input({
      segments: [seg({ id: 'a', title: 'A', desc: '', t_start: T(9), t_end: T(10) })],
    }))
    assert.ok(rules(out).includes('no-speaker'))
    assert.ok(rules(out).includes('missing-abstract'))
    assert.ok(out.every((d: any) => 'warn' === d.severity), 'warnings never block')
  })

  test('near-miss: a break needs neither a speaker nor an abstract', () => {
    const out = warnings(input({
      segments: [seg({ id: 'brk', kind: 'brk', desc: '', t_start: T(9), t_end: T(10) })],
    }))
    assert.ok(!rules(out).includes('no-speaker'))
    assert.ok(!rules(out).includes('missing-abstract'))
  })

  test('speaker-no-email is a WARNING here - it is an error only at sync', () => {
    const out = warnings(input({
      speakers: [{ id: 'sp1', org_id: 'o1', name: 'Ada' }],
      segments: [seg({ id: 'a', t_start: T(9), t_end: T(10) })],
      appearances: [{ id: 'x', fixture_id: 'a', speaker_id: 'sp1' }],
    }))
    const d = out.find((x: any) => 'speaker-no-email' === x.rule)
    assert.ok(d)
    assert.equal(d.severity, 'warn', 'publication is not blocked by this')
    assert.match(d.fix, /blocks calendar sync, not publication/)
  })

  test('cancelled-holds-room asks, but only when the room is actually idle', () => {
    const idle = warnings(input({
      segments: [seg({
        id: 'gone', title: 'Gone', room_id: 'r1',
        effective_status: 'cancelled', t_start: T(9), t_end: T(10),
      })],
    }))
    assert.ok(rules(idle).includes('cancelled-holds-room'))

    // Near-miss: something else is using the room at that time, so the slot is
    // not idle and there is nothing to ask about.
    const busy = warnings(input({
      segments: [
        seg({ id: 'gone', room_id: 'r1', effective_status: 'cancelled', t_start: T(9), t_end: T(10) }),
        seg({ id: 'live', room_id: 'r1', t_start: T(9), t_end: T(10) }),
      ],
      appearances: [{ id: 'x', fixture_id: 'live', speaker_id: 'sp1' }],
    }))
    assert.ok(!rules(busy).includes('cancelled-holds-room'))
  })

  test('orphan-speaker explains itself rather than nagging', () => {
    const out = warnings(input({ segments: [] }))
    const d = out.find((x: any) => 'orphan-speaker' === x.rule)
    assert.ok(d)
    // Speakers are org-scoped and carry across editions (SPEC 8), so one not
    // speaking THIS year is normal. The fix text has to say so.
    assert.match(d.fix, /Expected/)
  })
})
