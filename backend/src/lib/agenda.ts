/* Build the published agenda snapshot. SPEC 9.1.
 *
 * STRUCTURAL EXCLUSION IS THE WHOLE POINT. This builder constructs the public
 * shape field by field from scratch. It never takes a stored row and deletes
 * keys from it, because that is the pattern that leaks: add a field to
 * cag/speaker next year and a delete-list quietly stops covering it, while a
 * build-list simply never picks it up. SPEC 22 warns that an assistant "will
 * helpfully include a joined speaker record complete with email".
 *
 * So: no spreads of stored rows anywhere below. Every field is named.
 *
 * Determinism (SPEC 17): identical input gives a byte-identical snapshot. No
 * timestamps, no random ids, every collection sorted by id. The publish time
 * lives on the snapshot ROW, never inside the payload - otherwise agenda.json
 * changes on every publish and "what changed since we published" becomes
 * unanswerable.
 */

export const SCHEMA_VERSION = 1

/** A fixture with effective values already resolved by concern:fixture. */
export type ResolvedFixture = {
  id: string
  parent_id?: string | null
  kind?: string
  slug?: string
  title?: string
  desc?: string
  t_start?: number
  t_end?: number
  t_tzn?: string
  p_name?: string
  w_site?: string
  w_video?: string
  w_deck?: string
  room_id?: string | null
  track_id?: string | null
  effective_status?: string
  effective_private?: boolean
  [k: string]: unknown
}

export type Row = { id: string; [k: string]: unknown }

export type BuildInput = {
  top: ResolvedFixture
  segments: ResolvedFixture[]
  rooms: Row[]
  tracks: Row[]
  speakers: Row[]
  appearances: Row[]
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Drop undefined so the JSON has no `"x": undefined`-shaped holes. */
function tidy<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) {
    if (undefined !== o[k] && null !== o[k]) out[k] = o[k]
  }
  return out as T
}

/**
 * Is this node publishable at all?
 *
 * Judged on EFFECTIVE values along the ancestor chain, never the node's own
 * fields (SPEC 8) - otherwise one confirmed child under an unfinished day
 * leaks into public output.
 *
 * Cancelled is PUBLISHED, marked cancelled (SPEC 9.1): an attendee holding a
 * printed programme needs to see the talk is off, and a silently vanished
 * session looks like a bug.
 */
export function isPublishable(f: ResolvedFixture): boolean {
  if (true === f.effective_private) return false
  const st = f.effective_status
  return 'confirmed' === st || 'cancelled' === st
}

export function buildAgenda(input: BuildInput): Record<string, unknown> {
  const { top, segments, rooms, tracks, speakers, appearances } = input

  // Talk-like and break-like segments alike; anything with a parent is a
  // candidate. Grouping fixtures (`day`) carry no room or time of their own in
  // the public shape and are resolved away here.
  const sessions = segments.filter((s) => 'day' !== s.kind).filter(isPublishable).sort(byId)

  const sessionIds = new Set(sessions.map((s) => s.id))

  // Only appearances on published sessions, and only the speakers they name.
  // A speaker with no published session never reaches the output at all.
  const liveAppearances = appearances
    .filter((a) => sessionIds.has(String(a.fixture_id)))
    .sort(byId)

  const speakerIds = new Set(liveAppearances.map((a) => String(a.speaker_id)))
  const speakerRows = speakers.filter((s) => speakerIds.has(s.id)).sort(byId)

  const speakersBySession = new Map<string, string[]>()
  for (const a of liveAppearances) {
    const list = speakersBySession.get(String(a.fixture_id)) ?? []
    list.push(String(a.speaker_id))
    speakersBySession.set(String(a.fixture_id), list)
  }
  for (const list of speakersBySession.values()) list.sort()

  const usedRooms = new Set(sessions.map((s) => s.room_id).filter(Boolean) as string[])
  const usedTracks = new Set(sessions.map((s) => s.track_id).filter(Boolean) as string[])

  return {
    schemaVersion: SCHEMA_VERSION,

    conference: tidy({
      slug: top.slug,
      title: top.title,
      desc: top.desc,
      t_start: top.t_start,
      t_end: top.t_end,
      t_tzn: top.t_tzn,
      venue: top.p_name,
      w_site: top.w_site,
    }),

    rooms: rooms
      .filter((r) => usedRooms.has(r.id))
      .sort(byId)
      .map((r) => tidy({ id: r.id, name: r.name, capacity: r.capacity, order: r.order })),

    tracks: tracks
      .filter((t) => usedTracks.has(t.id))
      .sort(byId)
      .map((t) => tidy({ id: t.id, name: t.name, color: t.color, order: t.order })),

    // NO email. Not filtered out - never picked up. C6: speaker emails are
    // never public, "stripped structurally, not by field selection".
    speakers: speakerRows.map((s) =>
      tidy({
        id: s.id,
        name: s.name,
        bio: s.bio,
        photo: s.photo,
        org_name: s.org_name,
        w_site: s.w_site,
      }),
    ),

    sessions: sessions.map((s) =>
      tidy({
        id: s.id,
        kind: s.kind,
        title: s.title,
        desc: s.desc,
        t_start: s.t_start,
        t_end: s.t_end,
        room: s.room_id,
        track: s.track_id,
        // The effective value, so a cancelled ancestor shows through.
        status: s.effective_status,
        speakers: speakersBySession.get(s.id) ?? [],
        w_video: s.w_video,
        w_deck: s.w_deck,
      }),
    ),
  }
}
