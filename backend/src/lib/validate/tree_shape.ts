/* Rules about where a fixture sits and how long it lasts. SPEC 16.1:
 *   outside-parent-fixture · negative-duration · bad-parent-kind
 *
 * Grouped in one file because all three are about STRUCTURE rather than about
 * two entities colliding, and they share the same walk.
 */

import { Diagnostic, sortDiagnostics } from './diagnostic'
import {
  Fixture, GROUP_KINDS, SEGMENT_KINDS, TOP_KINDS, ValidateInput, fixRef, quoted,
} from './input'

export const OUTSIDE = 'outside-parent-fixture'
export const NEGATIVE = 'negative-duration'
export const BAD_KIND = 'bad-parent-kind'

const has = (f: Fixture) => null != f.t_start && null != f.t_end

export function treeShape(input: ValidateInput): Diagnostic[] {
  const { top, segments } = input
  const all = [top, ...segments]
  const byId = new Map(all.map((f) => [f.id, f]))
  const childCount = new Map<string, number>()
  for (const f of segments) {
    const p = String(f.parent_id)
    childCount.set(p, (childCount.get(p) ?? 0) + 1)
  }

  const out: Diagnostic[] = []

  for (const f of all) {
    // --- negative-duration ------------------------------------------------
    // Also a model must(), kept here so imported and API data gets the same
    // diagnostic SHAPE rather than a raw validator error (SPEC 16.1).
    if (has(f) && !((f.t_end as number) > (f.t_start as number))) {
      out.push({
        rule: NEGATIVE,
        severity: 'error',
        message: quoted(f) + ' ends before it starts, or lasts no time at all.',
        entity: fixRef(f),
        related: [fixRef(f)],
        fix: 'Set an end time after the start time.',
        data: { t_start: f.t_start, t_end: f.t_end },
      })
    }

    // --- outside-parent-fixture -------------------------------------------
    // One rule for the whole tree: a talk outside its day, a day outside its
    // conference. Replaces v3's outside-day-bounds.
    const parent = null == f.parent_id ? null : byId.get(String(f.parent_id))
    if (parent && has(f) && has(parent)) {
      const before = (f.t_start as number) < (parent.t_start as number)
      const after = (f.t_end as number) > (parent.t_end as number)
      if (before || after) {
        out.push({
          rule: OUTSIDE,
          severity: 'error',
          message:
            quoted(f) + ' falls outside ' + quoted(parent) +
            (before && after ? ' at both ends.' : before ? ' — it starts too early.' : ' — it ends too late.'),
          entity: fixRef(f),
          related: [fixRef(f), fixRef(parent)],
          fix: 'Move ' + quoted(f) + ' inside ' + quoted(parent) + ', or widen the parent.',
          data: {
            t_start: f.t_start, t_end: f.t_end,
            parent_start: parent.t_start, parent_end: parent.t_end,
          },
        })
      }
    }

    // --- bad-parent-kind ---------------------------------------------------
    // Without this a talk can become a root, or a conference nest under a
    // talk, while satisfying every field rule - and top-fixture discovery,
    // invitation eligibility and the grid's grouping all turn ambiguous.
    const kind = String(f.kind ?? '')
    const isTop = null == f.parent_id || '' === f.parent_id
    const say = (why: string, fix: string) =>
      out.push({
        rule: BAD_KIND,
        severity: 'error',
        message: quoted(f) + ' (kind "' + kind + '") ' + why,
        entity: fixRef(f),
        related: parent ? [fixRef(f), fixRef(parent)] : [fixRef(f)],
        fix,
        data: { kind, parent_kind: parent ? parent.kind : null },
      })

    if (TOP_KINDS.includes(kind)) {
      if (!isTop) say('is a top-level kind but has a parent.',
        'Give it no parent, or change its kind to a segment kind.')
    } else if (GROUP_KINDS.includes(kind)) {
      if (isTop) say('is a grouping kind but has no parent.', 'Put it under a conference.')
      else if (parent && !TOP_KINDS.includes(String(parent.kind)))
        say('must sit directly under a conference, not under ' + quoted(parent) + '.',
          'Move it directly under the conference.')
    } else if (SEGMENT_KINDS.includes(kind)) {
      if (isTop) say('is a segment but has no parent.',
        'Put it under a conference or a day.')
      else if (parent && !TOP_KINDS.includes(String(parent.kind)) &&
               !GROUP_KINDS.includes(String(parent.kind)))
        say('sits under ' + quoted(parent) + ', which is itself a segment.',
          'Segments contain nothing. Move it under a conference or a day.')
      else if (0 < (childCount.get(f.id) ?? 0))
        say('is a segment but contains other fixtures.',
          'Segments contain nothing. Move its children, or make it a day.')
    } else {
      say('is not a known kind.',
        'Use a conference (con/web/mep/sem/gen), a day, or a segment ' +
        '(key/tak/lgt/wrk/pan/brk/mea/soc/reg).')
    }
  }

  return sortDiagnostics(out)
}
