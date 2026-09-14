/* Rule: speaker-double-booked. SPEC 16.1 - "One speaker appears in two
 * overlapping segments."
 *
 * The one an organiser cannot see by eye: a room clash is visible in the grid
 * column, but a speaker booked twice is two cells apart.
 */

import { overlaps, overlapMs, Interval } from '../overlap'
import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Fixture, ValidateInput, fixRef, isLive, quoted, ref } from './input'

export const RULE = 'speaker-double-booked'

const iv = (f: Fixture): Interval => ({ start: f.t_start as number, end: f.t_end as number })
const minutes = (ms: number) => Math.floor(ms / 60000)

export function speakerDoubleBooked(input: ValidateInput): Diagnostic[] {
  const { segments, speakers, appearances } = input

  const byId = new Map(segments.map((s) => [s.id, s]))
  const name = new Map(speakers.map((s) => [s.id, String(s.name ?? s.id)]))

  // Segment ids per speaker, live and timed only.
  const bySpeaker = new Map<string, Fixture[]>()
  for (const a of appearances) {
    const seg = byId.get(String(a.fixture_id))
    if (!seg || !isLive(seg) || null == seg.t_start || null == seg.t_end) continue
    const list = bySpeaker.get(String(a.speaker_id)) ?? []
    list.push(seg)
    bySpeaker.set(String(a.speaker_id), list)
  }

  const out: Diagnostic[] = []

  for (const [speaker_id, segs] of [...bySpeaker.entries()].sort()) {
    const ordered = segs
      .slice()
      .sort((a, b) => (a.t_start as number) - (b.t_start as number) || (a.id < b.id ? -1 : 1))

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i]
        const b = ordered[j]
        if (!overlaps(iv(a), iv(b))) continue

        const who = name.get(speaker_id) ?? speaker_id
        out.push({
          rule: RULE,
          severity: 'error',
          message:
            who + ' is in two overlapping sessions — ' + quoted(a) + ' and ' + quoted(b) +
            ', overlapping by ' + minutes(overlapMs(iv(a), iv(b))) + ' min.',
          entity: fixRef(a),
          related: [fixRef(a), fixRef(b), ref('cag/speaker', speaker_id, who)],
          fix:
            'Move one session, or take ' + who + ' off one of them. A speaker cannot be in ' +
            'two places, and both audiences will notice.',
          data: {
            speaker_id,
            overlap_start: Math.max(a.t_start as number, b.t_start as number),
            overlap_end: Math.min(a.t_end as number, b.t_end as number),
            overlap_ms: overlapMs(iv(a), iv(b)),
          },
        })
      }
    }
  }

  return sortDiagnostics(out)
}
