/* Rule: room-double-booked. SPEC 16.1 - "Two segments overlap in one room."
 *
 * Error severity: blocks publication, and blocks apply:sync.
 */

import { overlaps, overlapMs, Interval } from '../overlap'
import { Diagnostic, EntityRef, sortDiagnostics } from './diagnostic'

export const RULE = 'room-double-booked'

/**
 * A segment as this rule needs it.
 *
 * `effective_status` is resolved along the ancestor chain, most restrictive
 * wins (SPEC 8) - a confirmed talk under a cancelled day is effectively
 * cancelled. That resolution is shared logic owned by `concern:fixture,*`
 * (PLATFORM 1.5), so this rule takes the ANSWER as input rather than walking
 * the chain itself. SPEC 22 names an inline copy of a concern's rule as one of
 * the two most common failures on this stack: it passes its own tests and then
 * diverges the first time either changes.
 *
 * When `effective_status` is absent the node's own `status` is used. That is a
 * documented default for flat data (imports, a single-level fixture), not a
 * substitute for the ancestor walk.
 */
export type RoomSegment = {
  id: string
  room_id?: string | null
  t_start: number
  t_end: number
  status?: string
  effective_status?: string
  title?: string
}

export type RoomInfo = {
  id: string
  name?: string
}

const effective = (s: RoomSegment) => s.effective_status ?? s.status ?? 'draft'

/** Minutes, rounded down - the unit the organiser reads in the diagnostic. */
const minutes = (ms: number) => Math.floor(ms / 60000)

const quoted = (s: RoomSegment) => '"' + (s.title ?? s.id) + '"'

/** Segments store t_start/t_end; the overlap helper speaks start/end. */
const iv = (s: RoomSegment): Interval => ({ start: s.t_start, end: s.t_end })

export function roomDoubleBooked(
  segments: RoomSegment[],
  rooms: RoomInfo[] = [],
): Diagnostic[] {
  const roomName = new Map(rooms.map((r) => [r.id, r.name ?? r.id]))

  // A cancelled segment does not double-book. It keeps its grid slot and stays
  // visible (SPEC 9.1), and whether the organiser meant to free the room is
  // asked by the `cancelled-holds-room` WARNING (SPEC 16.2) - not by an error
  // that blocks publication. The mockups pin this: the validation screen shows
  // a cancelled session holding a room as a warning beside two errors, not as
  // a third error.
  const live = segments.filter(
    (s) => null != s.room_id && '' !== s.room_id && 'cancelled' !== effective(s),
  )

  // Deterministic input order, so the output does not depend on how the caller
  // happened to sort its rows (SPEC 17).
  const ordered = live
    .slice()
    .sort((a, b) => a.t_start - b.t_start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const out: Diagnostic[] = []

  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]
      const b = ordered[j]

      if (a.room_id !== b.room_id) continue

      // Half-open: touching is not overlapping. One shared helper, never
      // reimplemented here (SPEC 16.1).
      if (!overlaps(iv(a), iv(b))) continue

      const room = String(a.room_id)
      const label = roomName.get(room) ?? room
      const mins = minutes(overlapMs(iv(a), iv(b)))

      const aRef: EntityRef = { canon: 'cag/fixture', id: a.id, label: a.title }
      const bRef: EntityRef = { canon: 'cag/fixture', id: b.id, label: b.title }

      out.push({
        rule: RULE,
        severity: 'error',
        message:
          label + ' — ' + quoted(a) + ' and ' + quoted(b) + ' overlap by ' + mins + ' min.',
        entity: aRef,
        related: [aRef, bRef, { canon: 'cag/room', id: room, label: roomName.get(room) }],
        fix:
          'Move one session to another room or time, or shorten ' +
          quoted(a) +
          ' so it ends before ' +
          quoted(b) +
          ' starts.',
        data: {
          room_id: room,
          // Instants, not wall time - the renderer formats these in the
          // conference zone.
          overlap_start: Math.max(a.t_start, b.t_start),
          overlap_end: Math.min(a.t_end, b.t_end),
          overlap_ms: overlapMs(iv(a), iv(b)),
        },
      })
    }
  }

  return sortDiagnostics(out)
}
