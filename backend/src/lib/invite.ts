/* iTIP INVITATIONS. SPEC 9.1, 10.3, 10.4, C3.
 *
 * NOT the same thing as the .ics feed in ics.ts, and conflating them is the
 * mistake this file exists to prevent:
 *
 *   ics.ts       METHOD:PUBLISH   a feed somebody SUBSCRIBES to. No attendees,
 *                                 no sequence, nobody is asked anything.
 *   this file    METHOD:REQUEST   an INVITATION addressed to named people, who
 *                METHOD:CANCEL    will be asked to accept it - and, crucially,
 *                                 which their client matches against an
 *                                 existing entry by UID and SEQUENCE.
 *
 * THREE FIELDS CARRY THE WHOLE OF C3, and getting any of them wrong turns an
 * update into a second entry in forty calendars:
 *
 *   UID       stable for the life of the segment. Never regenerated.
 *   SEQUENCE  incremented on every material change. A client ignores a REQUEST
 *             whose SEQUENCE is not greater than the one it holds - so a
 *             sequence that fails to advance is an update silently dropped,
 *             which looks exactly like the product not working.
 *   METHOD    REQUEST to create or update, CANCEL to withdraw. A cancellation
 *             sent as REQUEST is a meeting that never goes away.
 *
 * Deterministic (SPEC 17): no Date.now(), no random ids. DTSTAMP comes from
 * the event itself, so the same invitation built twice is byte-identical - and
 * the content hash that decides whether to re-send depends on that.
 */
import { EventSpec } from './eventspec'
import { vtimezone } from './ics'

const CRLF = '\r\n'

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

function utcStamp(ms: number): string {
  const d = new Date(ms)
  return String(d.getUTCFullYear())
    + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T'
    + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
}

function localStamp(ms: number, tzn: string): string {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tzn, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value
  return p.year + p.month + p.day + 'T' + ('24' === p.hour ? '00' : p.hour) + p.minute + p.second
}

/** RFC 5545 escaping. Order matters: backslash first, or it doubles the rest. */
function esc(text: string): string {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold at 75 OCTETS, not characters. A multi-byte character split across the
 * boundary produces a file some clients silently reject - and "the invitation
 * never arrived" is indistinguishable from "we never sent it".
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (75 >= bytes.length) return line

  const out: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Never cut mid-character: back up off a continuation byte (10xxxxxx).
    while (end > start && end < bytes.length && 0x80 === (bytes[end] & 0xc0)) end--
    out.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74 // continuation lines carry a leading space
  }
  return out.join(CRLF + ' ')
}

export type InviteInput = {
  spec: EventSpec
  sequence: number
  /** 'request' creates or updates; 'cancel' withdraws. */
  method: 'request' | 'cancel'
  /**
   * What the ledger decided this is. The SUBJECT needs it and the file does
   * not: METHOD:REQUEST covers a create and an update alike, but "Invitation"
   * and "Updated" are not the same sentence to read.
   */
  action?: 'create' | 'update' | 'cancel'
  /** The calendar the invitation comes FROM. */
  organiser: { name?: string; email: string }
  /** Shown in the body; the spec carries only addresses. */
  conference?: string
  desc?: string
}

/**
 * One VEVENT, addressed to the spec's attendees.
 *
 * The attendee list is the spec's, which is sorted and de-duplicated upstream -
 * so the same people in a different order do not produce a different file, and
 * therefore do not produce a re-send.
 */
export function buildInvite(input: InviteInput): string {
  const { spec, sequence, method, organiser } = input
  const tzn = spec.t_tzn || 'UTC'
  const cancelling = 'cancel' === method

  // A VTIMEZONE covering this event only. Null when the event spans a DST
  // transition, in which case the times go out as UTC instants - correct, if
  // less readable in the client (see ics.ts).
  const tz = vtimezone(tzn, spec.t_start, spec.t_end)
  const when = (ms: number) =>
    tz ? ';TZID=' + tzn + ':' + localStamp(ms, tzn) : ':' + utcStamp(ms)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//voxgig//conf-agenda//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:' + (cancelling ? 'CANCEL' : 'REQUEST'),
  ]
  if (tz) lines.push(...tz)

  lines.push(
    'BEGIN:VEVENT',
    // The ledger's UID, unchanged for the life of the segment. This is what
    // makes an edit an update IN the speaker's calendar (C3).
    'UID:' + spec.uid,
    // From the event, never the clock (SPEC 17).
    'DTSTAMP:' + utcStamp(spec.t_start),
    'SEQUENCE:' + String(sequence),
    'DTSTART' + when(spec.t_start),
    'DTEND' + when(spec.t_end),
    'SUMMARY:' + esc(spec.title),
  )

  if (input.desc) lines.push('DESCRIPTION:' + esc(input.desc))
  if (spec.room) lines.push('LOCATION:' + esc(spec.room))

  lines.push('ORGANIZER'
    + (organiser.name ? ';CN=' + esc(organiser.name) : '')
    + ':mailto:' + organiser.email)

  for (const email of spec.attendees) {
    // RSVP=TRUE asks the question; PARTSTAT=NEEDS-ACTION is the honest initial
    // answer. A cancellation still names its attendees - a CANCEL addressed to
    // nobody is a cancellation nobody receives.
    lines.push('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + email)
  }

  // STATUS and METHOD both, and they must agree. Some clients act on one and
  // some on the other; a file where they disagree gets treated differently by
  // different people on the same invitation.
  lines.push('STATUS:' + (cancelling ? 'CANCELLED' : 'CONFIRMED'))
  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.map(fold).join(CRLF) + CRLF
}

/**
 * The subject line a mail deliverer would use.
 *
 * THE ACTION DECIDES, NOT THE SEQUENCE. A RESURRECTION is built as a `create`
 * carrying the tombstone's sequence + 1 - same UID, so the speaker's client
 * matches it, which is the whole point of never deleting a link. Keying the
 * subject off the sequence therefore titled a brand-new invitation "Updated:"
 * for someone with nothing in their calendar to update.
 *
 * The sequence stays as the fallback for callers that do not say.
 */
export function inviteSubject(input: InviteInput): string {
  const prefix = 'cancel' === input.method || 'cancel' === input.action
    ? 'Cancelled: '
    : 'create' === input.action ? 'Invitation: '
      : 'update' === input.action ? 'Updated: '
        : 0 < input.sequence ? 'Updated: ' : 'Invitation: '
  return prefix + input.spec.title
    + (input.conference ? ' (' + input.conference + ')' : '')
}
