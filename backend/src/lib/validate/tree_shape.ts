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

/**
 * Why a fixture's kind is wrong for its position, or null when it is right.
 *
 * ONE DEFINITION OF THE RULE. The grid's save-time intents need this decision
 * BEFORE storing - SPEC 16.1 says bad-parent-kind is "checked at save time as
 * well as at validate" - and a second copy of the branch logic beside the
 * validator is how the two quietly drift apart. treeShape() below turns these
 * verdicts into diagnostics; an intent just refuses.
 */
export type KindVerdict =
  | 'top-has-parent'
  | 'group-no-parent'
  | 'group-not-under-top'
  | 'segment-no-parent'
  | 'segment-under-segment'
  | 'segment-has-children'
  | 'unknown-kind'
  | null

export function parentKindVerdict(
  kind: string,
  parentKind: string | null | undefined,
  hasChildren = false,
): KindVerdict {
  const k = String(kind ?? '')
  // A parent kind of null/'' means "no parent", which is what makes a top.
  const isTop = null == parentKind || '' === parentKind
  const pk = String(parentKind ?? '')

  if (TOP_KINDS.includes(k)) {
    return isTop ? null : 'top-has-parent'
  }
  if (GROUP_KINDS.includes(k)) {
    if (isTop) return 'group-no-parent'
    return TOP_KINDS.includes(pk) ? null : 'group-not-under-top'
  }
  if (SEGMENT_KINDS.includes(k)) {
    if (isTop) return 'segment-no-parent'
    if (!TOP_KINDS.includes(pk) && !GROUP_KINDS.includes(pk)) return 'segment-under-segment'
    return hasChildren ? 'segment-has-children' : null
  }
  return 'unknown-kind'
}

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

    // The DECISION is parentKindVerdict's; the sentences are this file's,
    // because only a diagnostic needs to name the other fixture.
    const verdict = parentKindVerdict(
      kind,
      isTop ? null : (parent ? String(parent.kind ?? '') : ''),
      0 < (childCount.get(f.id) ?? 0),
    )

    if ('top-has-parent' === verdict) {
      say('is a top-level kind but has a parent.',
        'Give it no parent, or change its kind to a segment kind.')
    } else if ('group-no-parent' === verdict) {
      say('is a grouping kind but has no parent.', 'Put it under a conference.')
    } else if ('group-not-under-top' === verdict) {
      if (parent) say('must sit directly under a conference, not under ' + quoted(parent) + '.',
        'Move it directly under the conference.')
    } else if ('segment-no-parent' === verdict) {
      say('is a segment but has no parent.',
        'Put it under a conference or a day.')
    } else if ('segment-under-segment' === verdict) {
      if (parent) say('sits under ' + quoted(parent) + ', which is itself a segment.',
        'Segments contain nothing. Move it under a conference or a day.')
    } else if ('segment-has-children' === verdict) {
      say('is a segment but contains other fixtures.',
        'Segments contain nothing. Move its children, or make it a day.')
    } else if ('unknown-kind' === verdict) {
      say('is not a known kind.',
        'Use a conference (con/web/mep/sem/gen), a day, or a segment ' +
        '(key/tak/lgt/wrk/pan/brk/mea/soc/reg).')
    }
  }

  return sortDiagnostics(out)
}
