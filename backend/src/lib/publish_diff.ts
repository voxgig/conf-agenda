/* What would change on the public page. SPEC 13.1: `P` "confirms; states what
 * changed since the last publish".
 *
 * IT DIFFS TWO SNAPSHOTS, not the live tree against a timestamp. `load:tree`
 * already returns an `unpublished` count from `t_m > published_at`, and a
 * count cannot say what changed. Worse, a timestamp cannot tell a change that
 * matters from one that does not: touching a session's abstract bumps `t_m`
 * and changes nothing an attendee sees, while a draft session bumps it and is
 * not published at all.
 *
 * So the comparison is between the snapshot publishing WOULD write and the one
 * currently stored. That reuses buildAgenda for every question about what is
 * publishable, rather than restating its rules here and having the two drift.
 * A draft is absent from both sides and therefore silent, which is correct: it
 * is not going out either way.
 *
 * Verbs are the organiser's vocabulary, not the model's. The mockup
 * (mockups/src/PublishConfirm.dc.html) reads "moved", "room", "speaker",
 * "cancelled" - one line per thing they would recognise having done.
 */

export type PublishChange = {
  fixture_id: string
  title: string
  /** added | moved | room | track | speaker | cancelled | restored | removed | edited */
  verb: string
  /** One line an organiser can read. Never an id on its own. */
  detail: string
}

type Snapshot = {
  sessions?: any[]
  rooms?: any[]
  tracks?: any[]
  speakers?: any[]
}

const nameOf = (list: any[] | undefined, id: any): string => {
  if (null == id || '' === id) return ''
  const hit = (list || []).find((x) => x.id === id)
  return String((hit && hit.name) || id)
}

/**
 * Wall time in the conference zone, for a detail line an organiser reads.
 * One module converts (SPEC 8.3); nothing else imports a date library.
 */
function clockFor(tzn?: string) {
  let fmt: any
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzn || 'UTC',
    })
  } catch (e) {
    fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return (ms: number) => (null == ms ? '' : fmt.format(new Date(ms)))
}

/**
 * Every change the public would see, in a stable order.
 *
 * `prev` is null for a conference that has never published, in which case
 * every session is `added`. "Never published" and "nothing changed" are
 * different facts and the screen says different things about them.
 */
export function publishDiff(
  prev: Snapshot | null,
  next: Snapshot,
  tzn?: string,
): PublishChange[] {
  const clock = clockFor(tzn)
  const out: PublishChange[] = []

  const before = new Map((prev?.sessions || []).map((s: any) => [String(s.id), s]))
  const after = new Map((next.sessions || []).map((s: any) => [String(s.id), s]))

  const say = (s: any, verb: string, detail: string) => out.push({
    fixture_id: String(s.id),
    title: String(s.title || s.id),
    verb,
    detail,
  })

  // --- gone -------------------------------------------------------------
  // A session that WAS published and is not in the new snapshot. Either it was
  // deleted, or it stopped being publishable (turned draft or private). Both
  // read the same way to an attendee: it disappears from the page.
  for (const id of [...before.keys()].sort()) {
    if (after.has(id)) continue
    const s = before.get(id)
    say(s, 'removed', 'was published, will no longer appear')
  }

  // --- new and changed --------------------------------------------------
  for (const id of [...after.keys()].sort()) {
    const now = after.get(id)
    const was = before.get(id)

    if (null == was) {
      say(now, 'added', null == prev
        ? 'first publish'
        : 'new since the last publish')
      continue
    }

    // CANCELLATION FIRST, and for the same reason the calendar reconciliation
    // checks it before the hash (docs/decisions/calendar-ledger.md): a
    // cancelled session keeps its slot and its times, so nothing else about it
    // need have changed. Reporting "room" on a talk that has been called off
    // is the wrong headline.
    if (was.status !== now.status) {
      if ('cancelled' === now.status) {
        say(now, 'cancelled', 'stays visible, marked cancelled')
        continue
      }
      if ('cancelled' === was.status) {
        say(now, 'restored', 'no longer cancelled')
        continue
      }
    }

    const moved = was.t_start !== now.t_start || was.t_end !== now.t_end
    const reroomed = String(was.room || '') !== String(now.room || '')

    // One line per session, and the strongest thing first. An organiser who
    // moved a talk to another room at another time did one thing, not two.
    if (moved && reroomed) {
      say(now, 'moved', nameOf(next.rooms, now.room) + ' · ' + clock(now.t_start))
      continue
    }
    if (moved) {
      say(now, 'moved', clock(now.t_start) + '–' + clock(now.t_end))
      continue
    }
    if (reroomed) {
      say(now, 'room', nameOf(next.rooms, now.room))
      continue
    }

    if (String(was.track || '') !== String(now.track || '')) {
      say(now, 'track', nameOf(next.tracks, now.track) || 'no track')
      continue
    }

    const wasWho = (was.speakers || []).slice().sort().join(',')
    const nowWho = (now.speakers || []).slice().sort().join(',')
    if (wasWho !== nowWho) {
      const names = (now.speakers || []).map((sid: any) => nameOf(next.speakers, sid))
      say(now, 'speaker', names.length ? names.join(', ') : 'nobody listed')
      continue
    }

    // Everything else an attendee can read. Deliberately last and deliberately
    // vague: it is the difference between "something about this changed" and
    // pretending a title edit is a schedule change.
    if (was.title !== now.title || was.desc !== now.desc ||
        was.kind !== now.kind || was.w_video !== now.w_video || was.w_deck !== now.w_deck) {
      say(now, 'edited', 'details changed')
    }
  }

  return out
}
