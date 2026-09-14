/* .ics and .csv feeds, built from a PUBLISHED SNAPSHOT. SPEC 6, 9.1.
 *
 * Derived from agenda.json, never from live rows - so a feed cannot contain
 * anything the public agenda does not, by construction rather than by a second
 * set of filters.
 *
 * DETERMINISTIC (SPEC 17): identical input gives byte-identical output. That
 * rules out Date.now() for DTSTAMP, which RFC 5545 requires - see below.
 */

const CRLF = '\r\n'

export type Agenda = {
  schemaVersion: number
  conference: { slug?: string; title?: string; t_tzn?: string; t_start?: number; t_end?: number; venue?: string }
  rooms: { id: string; name?: string }[]
  tracks: { id: string; name?: string }[]
  speakers: { id: string; name?: string }[]
  sessions: {
    id: string; title?: string; desc?: string; kind?: string
    t_start?: number; t_end?: number; room?: string; track?: string
    status?: string; speakers?: string[]
  }[]
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

/** YYYYMMDDTHHMMSS in a given IANA zone, via Intl - no date library (SPEC 8.3). */
function localStamp(ms: number, tzn: string): string {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tzn, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p: any = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`
}

function utcStamp(ms: number): string {
  const d = new Date(ms)
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
  )
}

/** Offset in minutes east of UTC for an instant in a zone. */
export function offsetMinutes(ms: number, tzn: string): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tzn, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p: any = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUTC - ms) / 60000)
}

function offsetText(mins: number): string {
  const sign = mins < 0 ? '-' : '+'
  const a = Math.abs(mins)
  return sign + pad(Math.floor(a / 60)) + pad(a % 60)
}

/** RFC 5545 escaping. Order matters: backslash first. */
function esc(text: string): string {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** RFC 5545 caps a content line at 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  if (75 >= line.length) return line
  const out = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (74 < rest.length) {
    out.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) out.push(' ' + rest)
  return out.join(CRLF)
}

/**
 * A VTIMEZONE for the conference window.
 *
 * A fully correct VTIMEZONE needs the zone's transition rules. Rather than
 * ship tz data, this computes the ACTUAL offset at the conference's start and
 * end. When they agree - true of almost every conference - one STANDARD
 * component describes the window exactly.
 *
 * When they DIFFER the conference spans a DST transition, and a single-offset
 * VTIMEZONE would silently put half the programme an hour out. So it returns
 * null and the caller falls back to UTC instants, which every client reads
 * correctly. Being visibly plain beats being subtly wrong (SPEC 8.3).
 */
export function vtimezone(tzn: string, from: number, to: number): string[] | null {
  let a: number
  let b: number
  try {
    a = offsetMinutes(from, tzn)
    b = offsetMinutes(to, tzn)
  } catch (e) {
    return null
  }
  if (a !== b) return null

  const off = offsetText(a)
  // LINES, not a joined block: the caller folds each content line to 75
  // octets, and folding a pre-joined block breaks it mid-line.
  return [
    'BEGIN:VTIMEZONE',
    'TZID:' + tzn,
    'BEGIN:STANDARD',
    // The window's own start, so the component is anchored in data rather than
    // in a fabricated epoch.
    'DTSTART:' + localStamp(from, tzn),
    'TZOFFSETFROM:' + off,
    'TZOFFSETTO:' + off,
    'TZNAME:' + tzn,
    'END:STANDARD',
    'END:VTIMEZONE',
  ]
}

export function buildIcs(agenda: Agenda): string {
  const conf = agenda.conference || {}
  const tzn = conf.t_tzn || 'UTC'
  const slug = conf.slug || 'conference'
  const roomName = new Map((agenda.rooms || []).map((r) => [r.id, r.name || r.id]))
  const trackName = new Map((agenda.tracks || []).map((t) => [t.id, t.name || t.id]))
  const speakerName = new Map((agenda.speakers || []).map((s) => [s.id, s.name || s.id]))

  const sessions = (agenda.sessions || [])
    .filter((s) => null != s.t_start && null != s.t_end)
    .slice()
    .sort((a, b) => (a.t_start as number) - (b.t_start as number) || (a.id < b.id ? -1 : 1))

  const from = conf.t_start ?? (sessions[0] && sessions[0].t_start) ?? 0
  const to = conf.t_end ?? (sessions[sessions.length - 1] && sessions[sessions.length - 1].t_end) ?? from
  const tz = vtimezone(tzn, from, to)

  // DTSTAMP is required by RFC 5545, and must NOT be the current time: SPEC 17
  // requires every derived file to be byte-identical for identical input, and
  // the calendar content hash depends on that. Derived from the conference
  // start instead - stable, and inside the data it describes.
  const stamp = utcStamp(from)

  const when = (ms: number) =>
    tz ? ';TZID=' + tzn + ':' + localStamp(ms, tzn) : ':' + utcStamp(ms)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//voxgig//conf-agenda//EN',
    'CALSCALE:GREGORIAN',
    // PUBLISH, not REQUEST: this is a feed somebody subscribes to, not an
    // invitation. Invitations are the calendar-sync path (SPEC 10.4).
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(conf.title || slug),
    'X-WR-TIMEZONE:' + tzn,
  ]
  if (tz) lines.push(...tz)

  for (const s of sessions) {
    const bits: string[] = [
      'BEGIN:VEVENT',
      // The same stable UID shape the calendar ledger uses (SPEC 10.3), so a
      // session keeps one identity across the feed and any invitation.
      'UID:' + s.id + '@' + slug,
      'DTSTAMP:' + stamp,
      'DTSTART' + when(s.t_start as number),
      'DTEND' + when(s.t_end as number),
      'SUMMARY:' + esc(s.title || s.id),
    ]

    const who = (s.speakers || []).map((id) => speakerName.get(id) || id)
    const desc = [s.desc, who.length ? 'Speakers: ' + who.join(', ') : ''].filter(Boolean).join('\n\n')
    if (desc) bits.push('DESCRIPTION:' + esc(desc))

    if (s.room) bits.push('LOCATION:' + esc(roomName.get(s.room) || s.room))
    if (s.track) bits.push('CATEGORIES:' + esc(trackName.get(s.track) || s.track))

    // A cancelled session is emitted as CANCELLED, never by dropping the
    // VEVENT (SPEC 9.1): a dropped event stays in a subscriber's calendar
    // forever, so the one thing that must not happen is silence.
    bits.push('STATUS:' + ('cancelled' === s.status ? 'CANCELLED' : 'CONFIRMED'))
    bits.push('END:VEVENT')

    lines.push(...bits)
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join(CRLF) + CRLF
}

/** A flat export, one row per session. */
export function buildCsv(agenda: Agenda): string {
  const tzn = agenda.conference?.t_tzn || 'UTC'
  const roomName = new Map((agenda.rooms || []).map((r) => [r.id, r.name || r.id]))
  const trackName = new Map((agenda.tracks || []).map((t) => [t.id, t.name || t.id]))
  const speakerName = new Map((agenda.speakers || []).map((s) => [s.id, s.name || s.id]))

  const cell = (v: unknown) => {
    const t = null == v ? '' : String(v)
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }

  const head = ['id', 'title', 'kind', 'status', 'date', 'start', 'end', 'room', 'track', 'speakers']
  const rows = (agenda.sessions || [])
    .slice()
    .sort((a, b) => (a.t_start || 0) - (b.t_start || 0) || (a.id < b.id ? -1 : 1))
    .map((s) => {
      const local = null == s.t_start ? '' : localStamp(s.t_start, tzn)
      const localEnd = null == s.t_end ? '' : localStamp(s.t_end, tzn)
      return [
        s.id, s.title, s.kind, s.status,
        local.slice(0, 4) + '-' + local.slice(4, 6) + '-' + local.slice(6, 8),
        local.slice(9, 11) + ':' + local.slice(11, 13),
        localEnd.slice(9, 11) + ':' + localEnd.slice(11, 13),
        s.room ? roomName.get(s.room) : '',
        s.track ? trackName.get(s.track) : '',
        (s.speakers || []).map((id) => speakerName.get(id) || id).join('; '),
      ].map(cell).join(',')
    })

  return [head.join(','), ...rows].join('\n') + '\n'
}
