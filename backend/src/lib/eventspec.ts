/* The EventSpec and its content hash. SPEC 10.3.
 *
 * THE NARROWNESS OF THIS SHAPE IS THE WHOLE DESIGN.
 *
 * The hash decides whether a speaker's calendar entry gets rewritten. So the
 * spec carries exactly the fields a speaker would NOTICE about a live event -
 * start, end, title, room, the attendee set - and nothing else. Not `t_m`, not
 * the abstract, not internal notes. Widen it and every incidental edit re-sends
 * forty invitations; narrow it further and a real room change goes undelivered.
 *
 * TWO CONSEQUENCES THAT ARE EASY TO GET WRONG:
 *
 * 1. Because the hash covers LIVE-event fields only, a cancelled segment's hash
 *    is typically UNCHANGED. Any reconciliation that compares hashes first will
 *    therefore no-op a cancellation and leave the event alive in the speaker's
 *    calendar. Cancellation must be checked BEFORE the hash - see CalendarSync.
 *
 * 2. The hash must be deterministic across processes and runs (SPEC 17). No
 *    Date.now(), no Math.random(), no unsorted key iteration: every object is
 *    serialised through a key-ordered writer below, and attendees are sorted.
 *    Non-determinism here does not produce a bad build - it produces a speaker
 *    who is emailed every time anything anywhere is saved.
 */
import Crypto from 'node:crypto'

/** Kinds a speaker is invited to. SPEC C1: talk-like segments only. */
export const INVITABLE_KINDS = new Set(['key', 'tak', 'lgt', 'wrk', 'pan'])

export type SpecFixture = {
  id: string
  kind?: string
  title?: string
  t_start?: number
  t_end?: number
  t_tzn?: string
  room_id?: string | null
  effective_status?: string
  effective_private?: boolean
  [k: string]: unknown
}

export type EventSpec = {
  uid: string
  title: string
  t_start: number
  t_end: number
  t_tzn: string
  room: string
  /** Emails, sorted. The SET is what matters, not the order it arrived in. */
  attendees: string[]
}

/**
 * The stable iCal UID: `<fixture-id>@<top-slug>`. It never changes for the
 * life of the segment, which is what makes an edit an UPDATE in the speaker's
 * calendar rather than a second entry (C3). Derived, never stored and never
 * regenerated - a UID from a random source would duplicate on every sync.
 */
export function uidFor(fixtureId: string, topSlug: string): string {
  return fixtureId + '@' + (topSlug || 'conference')
}

/**
 * Deterministic JSON: keys sorted at every level, no whitespace. The store can
 * hand back an object with a different key order than it went in with, and
 * JSON.stringify would then produce different bytes for identical data.
 */
export function stableStringify(value: unknown): string {
  if (null === value || 'object' !== typeof value) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys
    .map((k) => JSON.stringify(k) + ':' + stableStringify((value as any)[k]))
    .join(',') + '}'
}

/** Whether this segment is one a speaker should ever be invited to (C1). */
export function invitable(f: SpecFixture): boolean {
  if (!INVITABLE_KINDS.has(String(f.kind))) return false
  // EFFECTIVE status and visibility, resolved along the ancestor chain by
  // concern:fixture - never the node's own fields. A confirmed talk under a
  // draft day is not invitable (SPEC 8, C1).
  if ('confirmed' !== f.effective_status) return false
  if (true === f.effective_private) return false
  if ('number' !== typeof f.t_start || 'number' !== typeof f.t_end) return false
  return f.t_end > f.t_start
}

export type BuildSpecInput = {
  fixture: SpecFixture
  topSlug: string
  /** Room name, not id: the id means nothing in a calendar entry. */
  roomName?: string | null
  /** Conference timezone, inherited when the segment carries none. */
  tzn?: string | null
  attendees: string[]
}

export function buildSpec(input: BuildSpecInput): EventSpec {
  const f = input.fixture
  return {
    uid: uidFor(f.id, input.topSlug),
    title: String(f.title || f.id),
    t_start: f.t_start as number,
    t_end: f.t_end as number,
    t_tzn: String(f.t_tzn || input.tzn || 'UTC'),
    room: String(input.roomName || ''),
    // Sorted and de-duplicated: the same people in a different order is not a
    // change, and must not read as one.
    attendees: [...new Set(input.attendees.filter(Boolean))].sort(),
  }
}

/**
 * The content hash. Covers the spec and nothing else - see the header.
 * Truncated to 32 hex characters: 128 bits, far past collision concerns here,
 * and short enough to read in a diagnostic.
 */
export function hashSpec(spec: EventSpec): string {
  return Crypto.createHash('sha256')
    .update(stableStringify(spec))
    .digest('hex')
    .slice(0, 32)
}


/** Human labels for the spec fields, in the order an organiser reads them. */
const FIELD_LABEL: [keyof EventSpec, string][] = [
  ['t_start', 'start time'],
  ['t_end', 'end time'],
  ['room', 'room'],
  ['title', 'title'],
  ['t_tzn', 'timezone'],
  ['attendees', 'attendee set'],
]

/**
 * WHAT changed, not merely THAT something did.
 *
 * The hash answers "does this need sending"; it cannot answer "why am I about
 * to email forty people", which is the question the sync plan exists to
 * answer (SPEC 10.3, mockups/src/SyncPlan.dc.html). An organiser shown
 * "hash differs" has been told nothing and will either apply blindly or not
 * at all.
 */
export function diffSpecs(prev: EventSpec | null, next: EventSpec): string[] {
  if (null == prev) return []
  const out: string[] = []
  for (const [key, label] of FIELD_LABEL) {
    const a = prev[key]
    const b = next[key]
    const same = Array.isArray(a) || Array.isArray(b)
      ? stableStringify(a || []) === stableStringify(b || [])
      : a === b
    if (!same) out.push(label)
  }
  return out
}
