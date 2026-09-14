/* Warnings. SPEC 16.2 - things worth saying that do NOT block publication.
 *
 * The distinction matters: an error stops a conference going out, so a rule
 * that is merely a good idea must not be one. `speaker-no-email` is the
 * interesting case - a warning for the agenda, an ERROR for sync, because a
 * speaker with no address cannot be invited.
 */

import { overlaps, Interval } from '../overlap'
import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Fixture, TALK_KINDS, ValidateInput, fixRef, quoted, ref } from './input'

export const NO_SPEAKER = 'no-speaker'
export const SPEAKER_NO_EMAIL = 'speaker-no-email'
export const MISSING_ABSTRACT = 'missing-abstract'
export const CANCELLED_HOLDS_ROOM = 'cancelled-holds-room'
export const OVER_CAPACITY = 'over-capacity'
export const ORPHAN_SPEAKER = 'orphan-speaker'

const iv = (f: Fixture): Interval => ({ start: f.t_start as number, end: f.t_end as number })
const effective = (f: Fixture) => f.effective_status ?? f.status ?? 'draft'

export function warnings(input: ValidateInput): Diagnostic[] {
  const { segments, rooms, speakers, appearances } = input
  const out: Diagnostic[] = []

  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const speakerById = new Map(speakers.map((s) => [s.id, s]))
  const bySegment = new Map<string, string[]>()
  const speakerUsed = new Set<string>()

  for (const a of appearances) {
    const list = bySegment.get(String(a.fixture_id)) ?? []
    list.push(String(a.speaker_id))
    bySegment.set(String(a.fixture_id), list)
    speakerUsed.add(String(a.speaker_id))
  }

  for (const s of segments) {
    const kind = String(s.kind ?? '')
    const talkLike = TALK_KINDS.includes(kind)
    const cancelled = 'cancelled' === effective(s)

    // --- no-speaker --------------------------------------------------------
    if (talkLike && !cancelled && 0 === (bySegment.get(s.id) ?? []).length) {
      out.push({
        rule: NO_SPEAKER,
        severity: 'warn',
        message: quoted(s) + ' has no speaker.',
        entity: fixRef(s),
        related: [fixRef(s)],
        fix: 'Add a speaker, or change the kind if it is not a talk.',
      })
    }

    // --- speaker-no-email --------------------------------------------------
    // A warning HERE. It becomes an error at sync, because an invitation
    // needs somewhere to go (SPEC 16.2).
    for (const sid of (bySegment.get(s.id) ?? []).slice().sort()) {
      const sp = speakerById.get(sid)
      if (!talkLike || cancelled || null == sp) continue
      if (null == sp.email || '' === sp.email) {
        out.push({
          rule: SPEAKER_NO_EMAIL,
          severity: 'warn',
          message:
            String(sp.name ?? sid) + ' has no email, so cannot be sent a calendar invitation.',
          entity: ref('cag/speaker', sid, String(sp.name ?? '')),
          related: [ref('cag/speaker', sid, String(sp.name ?? '')), fixRef(s)],
          fix: 'Add an email address. This blocks calendar sync, not publication.',
        })
      }
    }

    // --- missing-abstract --------------------------------------------------
    if (talkLike && !cancelled && (null == s.desc || '' === s.desc)) {
      out.push({
        rule: MISSING_ABSTRACT,
        severity: 'warn',
        message: quoted(s) + ' has no abstract.',
        entity: fixRef(s),
        related: [fixRef(s)],
        fix: 'Add one — it appears in the agenda and in the calendar invitation.',
      })
    }

    // --- cancelled-holds-room ---------------------------------------------
    // Asks whether the organiser meant to free the room. It does NOT change
    // how the session is published: a cancelled session keeps its slot and
    // stays visible (SPEC 9.1).
    if (cancelled && null != s.room_id && '' !== s.room_id) {
      const clash = segments.some(
        (o) =>
          o.id !== s.id && o.room_id === s.room_id && 'cancelled' !== effective(o) &&
          null != o.t_start && null != s.t_start && overlaps(iv(s), iv(o)),
      )
      if (!clash) {
        out.push({
          rule: CANCELLED_HOLDS_ROOM,
          severity: 'warn',
          message:
            quoted(s) + ' is cancelled but still holds ' +
            String(roomById.get(String(s.room_id))?.name ?? s.room_id) + '. Free the room?',
          entity: fixRef(s),
          related: [fixRef(s), ref('cag/room', String(s.room_id))],
          fix: 'Clear its room to free the slot, or leave it if the room stays blocked.',
        })
      }
    }

    // --- over-capacity -----------------------------------------------------
    const room = null == s.room_id ? null : roomById.get(String(s.room_id))
    const cap = room && 'number' === typeof room.capacity ? room.capacity : null
    const expected = 'number' === typeof (s as any).expected ? (s as any).expected : null
    if (null != cap && null != expected && expected > cap) {
      out.push({
        rule: OVER_CAPACITY,
        severity: 'warn',
        message:
          quoted(s) + ' expects ' + expected + ' people in a room that holds ' + cap + '.',
        entity: fixRef(s),
        related: [fixRef(s), ref('cag/room', String(s.room_id))],
        fix: 'Move it to a larger room.',
      })
    }
  }

  // --- orphan-speaker ------------------------------------------------------
  for (const sp of speakers.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (speakerUsed.has(sp.id)) continue
    out.push({
      rule: ORPHAN_SPEAKER,
      severity: 'warn',
      message: String(sp.name ?? sp.id) + ' is not speaking at this conference.',
      entity: ref('cag/speaker', sp.id, String(sp.name ?? '')),
      related: [ref('cag/speaker', sp.id, String(sp.name ?? ''))],
      fix:
        'Expected — speakers are org-scoped and carry across editions. ' +
        'Add them to a session, or ignore this.',
    })
  }

  return sortDiagnostics(out)
}
