/* Warnings. SPEC 16.2 - things worth saying that do NOT block publication.
 *
 * The distinction matters: an error stops a conference going out, so a rule
 * that is merely a good idea must not be one. `speaker-no-email` is the
 * interesting case - a warning for the agenda, an ERROR for sync, because a
 * speaker with no address cannot be invited.
 */

import { overlaps, Interval } from '../overlap'
import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Fixture, SEGMENT_KINDS, TALK_KINDS, ValidateInput, fixRef, quoted, ref } from './input'

export const NO_SPEAKER = 'no-speaker'
export const SPEAKER_NO_EMAIL = 'speaker-no-email'
export const MISSING_ABSTRACT = 'missing-abstract'
export const CANCELLED_HOLDS_ROOM = 'cancelled-holds-room'
export const OVER_CAPACITY = 'over-capacity'
export const ORPHAN_SPEAKER = 'orphan-speaker'
export const ORPHAN_TRACK = 'orphan-track'
export const TRACK_OVERLAP = 'track-overlap'
export const NO_TURNOVER = 'no-turnover'
export const LONG_GAP = 'long-gap'
export const MISSING_BIO = 'missing-bio'
export const MISSING_PHOTO = 'missing-photo'
export const DRAFT_IN_PUBLISH = 'draft-in-publish'
export const DEEP_NESTING = 'deep-nesting'

const MINUTE = 60 * 1000

/**
 * Thresholds, named rather than inline.
 *
 * `turnover` is the gap a room needs between sessions: people leaving, people
 * arriving, a laptop swap. Ten minutes is the conventional floor and the
 * point at which a programme starts running late by construction.
 *
 * `long_gap` is a hole in the programme big enough that attendees will assume
 * it is a mistake. Ninety minutes is longer than any normal break and shorter
 * than a deliberate afternoon off.
 *
 * `depth` is SPEC 16.2's "more than three levels deep", which the spec calls
 * almost always a data error rather than a programme.
 */
export const THRESHOLD = {
  turnover: 10 * MINUTE,
  long_gap: 90 * MINUTE,
  depth: 3,
}

const iv = (f: Fixture): Interval => ({ start: f.t_start as number, end: f.t_end as number })
const effective = (f: Fixture) => f.effective_status ?? f.status ?? 'draft'
const timed = (f: Fixture) => null != f.t_start && null != f.t_end

/** Kinds that appear in the grid as sessions, rather than as structure. */
const SEGMENT_LIKE = new Set(SEGMENT_KINDS)

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

  // --- missing-bio / missing-photo ----------------------------------------
  // Only for speakers who are actually ON the programme: an org-scoped
  // speaker carried over from last year with no bio is not this conference's
  // problem, and orphan-speaker already says they are unused.
  for (const sp of speakers.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!speakerUsed.has(sp.id)) continue
    const name = String(sp.name ?? sp.id)
    const who = ref('cag/speaker', sp.id, name)

    if (null == sp.bio || '' === String(sp.bio).trim()) {
      out.push({
        rule: MISSING_BIO,
        severity: 'warn',
        message: name + ' has no bio.',
        entity: who,
        related: [who],
        fix: 'Add a short bio, or accept a bare name on the public page.',
      })
    }
    if (null == sp.photo || '' === String(sp.photo).trim()) {
      out.push({
        rule: MISSING_PHOTO,
        severity: 'warn',
        message: name + ' has no photo.',
        entity: who,
        related: [who],
        fix: 'Add a photo, or accept the initials placeholder.',
      })
    }
  }

  // --- orphan-track --------------------------------------------------------
  {
    const trackUsed = new Set(segments
      .map((s) => (null == s.track_id ? '' : String(s.track_id)))
      .filter((t) => '' !== t))

    for (const t of input.tracks.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (trackUsed.has(t.id)) continue
      const name = String(t.name ?? t.id)
      out.push({
        rule: ORPHAN_TRACK,
        severity: 'warn',
        message: 'Track ' + JSON.stringify(name) + ' has no sessions.',
        entity: ref('cag/track', t.id, name),
        related: [ref('cag/track', t.id, name)],
        fix: 'Assign sessions to it, or remove the track.',
      })
    }
  }

  // --- track-overlap -------------------------------------------------------
  // Two sessions in the SAME track at the same time. Not an error - a track
  // is a theme, not a room, and a big conference may deliberately run two
  // strands of one theme - but it is usually an accident, and an attendee
  // following a track cannot be in both.
  {
    const byTrack = new Map<string, Fixture[]>()
    for (const s of segments) {
      if (null == s.track_id || '' === s.track_id) continue
      if (!timed(s) || 'cancelled' === effective(s)) continue
      const key = String(s.track_id)
      const list = byTrack.get(key) ?? []
      list.push(s)
      byTrack.set(key, list)
    }

    for (const key of [...byTrack.keys()].sort()) {
      const list = (byTrack.get(key) as Fixture[])
        .slice()
        .sort((a, b) => (a.t_start as number) - (b.t_start as number) ||
          (a.id < b.id ? -1 : 1))
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (!overlaps(iv(list[i]), iv(list[j]))) continue
          const track = input.tracks.find((t) => t.id === key)
          out.push({
            rule: TRACK_OVERLAP,
            severity: 'warn',
            message: 'Track ' + JSON.stringify(String(track?.name ?? key)) + ': ' +
              quoted(list[i]) + ' and ' + quoted(list[j]) + ' run at the same time.',
            entity: fixRef(list[i]),
            // BOTH SIDES (SPEC 16.3), same as every other clash.
            related: [fixRef(list[i]), fixRef(list[j]), ref('cag/track', key)],
            fix: 'Move one, or accept that the track runs two strands.',
          })
        }
      }
    }
  }

  // --- no-turnover / long-gap ---------------------------------------------
  // Both are about the gap BETWEEN consecutive sessions in one room, read
  // from opposite ends: too short to change over, or so long it looks like
  // something is missing.
  {
    const byRoom = new Map<string, Fixture[]>()
    for (const s of segments) {
      if (null == s.room_id || '' === s.room_id) continue
      if (!timed(s) || 'cancelled' === effective(s)) continue
      const key = String(s.room_id)
      const list = byRoom.get(key) ?? []
      list.push(s)
      byRoom.set(key, list)
    }

    for (const key of [...byRoom.keys()].sort()) {
      const list = (byRoom.get(key) as Fixture[])
        .slice()
        .sort((a, b) => (a.t_start as number) - (b.t_start as number) ||
          (a.id < b.id ? -1 : 1))

      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1]
        const next = list[i]
        const gap = (next.t_start as number) - (prev.t_end as number)
        // A negative gap is an overlap, which room-double-booked already
        // reports as an ERROR. Saying it twice in two severities is noise.
        if (0 > gap) continue

        const room = roomById.get(key)
        const where = ' in ' + JSON.stringify(String(room?.name ?? key))

        if (gap < THRESHOLD.turnover) {
          out.push({
            rule: NO_TURNOVER,
            severity: 'warn',
            message: 'Only ' + Math.round(gap / MINUTE) + ' min between ' +
              quoted(prev) + ' and ' + quoted(next) + where + '.',
            entity: fixRef(next),
            related: [fixRef(prev), fixRef(next), ref('cag/room', key)],
            fix: 'Allow at least ' + Math.round(THRESHOLD.turnover / MINUTE) +
              ' min for the room to change over.',
            data: { gap_ms: gap },
          })
        } else if (gap > THRESHOLD.long_gap) {
          out.push({
            rule: LONG_GAP,
            severity: 'warn',
            message: Math.round(gap / MINUTE) + ' min with nothing on' + where +
              ', between ' + quoted(prev) + ' and ' + quoted(next) + '.',
            entity: fixRef(next),
            related: [fixRef(prev), fixRef(next), ref('cag/room', key)],
            fix: 'Add a session or a break, or accept the gap.',
            data: { gap_ms: gap },
          })
        }
      }
    }
  }

  // --- draft-in-publish ----------------------------------------------------
  // A draft session is invisible on the public page, so publishing with one
  // in the grid silently drops it. That is a warning and not an error
  // because it is also the normal way to hold a slot back.
  for (const s of segments) {
    if ('draft' !== effective(s)) continue
    if (!SEGMENT_LIKE.has(String(s.kind ?? ''))) continue
    out.push({
      rule: DRAFT_IN_PUBLISH,
      severity: 'warn',
      message: quoted(s) + ' is still a draft and will not be published.',
      entity: fixRef(s),
      related: [fixRef(s)],
      fix: 'Confirm it, or leave it out on purpose.',
    })
  }

  // --- deep-nesting --------------------------------------------------------
  // SPEC 16.2: "a fixture tree more than three levels deep is almost always a
  // data error, not a programme". Depth is counted from the top fixture, so
  // conference → day → talk is three and fine.
  {
    const byId = new Map([input.top, ...segments].map((f) => [f.id, f]))
    const depthOf = (f: Fixture): number => {
      let n = 1
      let at: Fixture | undefined = f
      const seen = new Set<string>()
      while (null != at && !seen.has(at.id)) {
        seen.add(at.id)
        const p: string | null | undefined = at.parent_id
        at = null == p || '' === p ? undefined : byId.get(String(p))
        if (null != at) n++
      }
      return n
    }

    for (const s of segments) {
      const depth = depthOf(s)
      if (depth <= THRESHOLD.depth) continue
      out.push({
        rule: DEEP_NESTING,
        severity: 'warn',
        message: quoted(s) + ' is ' + depth + ' levels deep.',
        entity: fixRef(s),
        related: [fixRef(s)],
        fix: 'Flatten the tree — conference, day, session is usually all it needs.',
        data: { depth },
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
