import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

// Compiled output - the test project's rootDir is test/ (see boot.test.ts).
const { roomDoubleBooked, RULE } = require('../../dist/lib/validate/room_double_booked.js')

type Seg = {
  id: string
  room_id?: string | null
  t_start: number
  t_end: number
  status?: string
  effective_status?: string
  title?: string
}

const TINY = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'),
)
const tinySegments = (): Seg[] =>
  (TINY['cag/fixture'] as Seg[]).filter((f: any) => null != f.parent_id)
const tinyRooms = () => TINY['cag/room']

// A minute, and a base instant, so the hand-built cases read like a schedule.
const M = 60000
const T = (h: number, m = 0) => 1825200000000 + h * 60 * M + m * M

describe('rule: room-double-booked', () => {
  test('TRIGGERS on the tiny fixture, exactly once', () => {
    const found = roomDoubleBooked(tinySegments(), tinyRooms())

    assert.equal(found.length, 1, 'one clash, and only one')
    const d = found[0]
    assert.equal(d.rule, RULE)
    assert.equal(d.severity, 'error')
    assert.equal(d.entity.id, 'seg_buses')
    assert.equal(d.data.overlap_ms, 30 * M, '30 minutes in Room A')
  })

  test('names BOTH sides of the clash (SPEC 16.3)', () => {
    const [d] = roomDoubleBooked(tinySegments(), tinyRooms())

    const ids = d.related
      .filter((r: any) => 'cag/fixture' === r.canon)
      .map((r: any) => r.id)
      .sort()
    assert.deepEqual(ids, ['seg_buses', 'seg_d1edge'], 'both sides, not just one')

    // The room is named too, so a renderer needs no second lookup.
    assert.ok(d.related.some((r: any) => 'cag/room' === r.canon && 'room_a' === r.id))

    assert.match(d.message, /Room A/)
    assert.match(d.message, /overlap by 30 min/)
    assert.ok(d.fix.length > 0, 'a human-readable fix')
  })

  test('does NOT trigger on the near-miss - touching is not overlapping', () => {
    // The half-open case SPEC 16.1 names: one ends exactly as the next starts,
    // same room. This is the failure that would tell every speaker about a
    // clash that does not exist.
    const near: Seg[] = [
      { id: 'a', room_id: 'r1', t_start: T(9), t_end: T(10), status: 'confirmed', title: 'A' },
      { id: 'b', room_id: 'r1', t_start: T(10), t_end: T(11), status: 'confirmed', title: 'B' },
    ]
    assert.deepEqual(roomDoubleBooked(near), [])
  })

  test('does not trigger across different rooms', () => {
    const segs: Seg[] = [
      { id: 'a', room_id: 'r1', t_start: T(10), t_end: T(11), status: 'confirmed' },
      { id: 'b', room_id: 'r2', t_start: T(10), t_end: T(11), status: 'confirmed' },
    ]
    assert.deepEqual(roomDoubleBooked(segs), [])
  })

  test('a cancelled segment does not double-book', () => {
    // It keeps its grid slot and stays published (SPEC 9.1); whether to free
    // the room is the `cancelled-holds-room` WARNING's question, not an error
    // that blocks publication.
    const segs: Seg[] = [
      { id: 'live', room_id: 'r1', t_start: T(10), t_end: T(11), status: 'confirmed' },
      { id: 'gone', room_id: 'r1', t_start: T(10), t_end: T(11), status: 'cancelled' },
    ]
    assert.deepEqual(roomDoubleBooked(segs), [])
  })

  test('effective status wins over the node\'s own status', () => {
    // A confirmed talk under a cancelled day is effectively cancelled (SPEC 8,
    // most restrictive wins). concern:fixture resolves this; the rule consumes
    // the answer.
    const segs: Seg[] = [
      { id: 'live', room_id: 'r1', t_start: T(10), t_end: T(11), status: 'confirmed' },
      {
        id: 'under_cancelled_day',
        room_id: 'r1',
        t_start: T(10),
        t_end: T(11),
        status: 'confirmed',
        effective_status: 'cancelled',
      },
    ]
    assert.deepEqual(roomDoubleBooked(segs), [], 'the ancestor chain decides, not the node')

    // And the reverse: without the resolved value it WOULD be flagged, which
    // is what makes the assertion above meaningful rather than vacuous.
    const naive = segs.map((s) => ({ ...s, effective_status: undefined }))
    assert.equal(roomDoubleBooked(naive).length, 1)
  })

  test('segments with no room are ignored', () => {
    const segs: Seg[] = [
      { id: 'a', t_start: T(10), t_end: T(11), status: 'confirmed' },
      { id: 'b', room_id: null, t_start: T(10), t_end: T(11), status: 'confirmed' },
      { id: 'c', room_id: '', t_start: T(10), t_end: T(11), status: 'confirmed' },
    ]
    assert.deepEqual(roomDoubleBooked(segs), [])
  })

  test('reports every clashing pair when one room is triple-booked', () => {
    const segs: Seg[] = [
      { id: 'a', room_id: 'r1', t_start: T(10), t_end: T(12), status: 'confirmed', title: 'A' },
      { id: 'b', room_id: 'r1', t_start: T(10, 30), t_end: T(11), status: 'confirmed', title: 'B' },
      { id: 'c', room_id: 'r1', t_start: T(11), t_end: T(13), status: 'confirmed', title: 'C' },
    ]
    // a+b, a+c overlap. b+c touch at 11:00 and must not be reported.
    const pairs = roomDoubleBooked(segs).map((d: any) =>
      d.related
        .filter((r: any) => 'cag/fixture' === r.canon)
        .map((r: any) => r.id)
        .sort()
        .join('+'),
    )
    assert.deepEqual(pairs.sort(), ['a+b', 'a+c'])
  })

  test('output is deterministic regardless of input order (SPEC 17)', () => {
    const segs = tinySegments()
    const forward = JSON.stringify(roomDoubleBooked(segs, tinyRooms()))
    const reversed = JSON.stringify(roomDoubleBooked(segs.slice().reverse(), tinyRooms()))
    const rotated = JSON.stringify(
      roomDoubleBooked([...segs.slice(2), ...segs.slice(0, 2)], tinyRooms()),
    )
    assert.equal(forward, reversed, 'reversed input, identical output')
    assert.equal(forward, rotated, 'rotated input, identical output')
  })
})
