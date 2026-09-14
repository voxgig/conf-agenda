/* Rules about what a fixture points at. SPEC 16.1:
 *   unknown-reference · cross-tenant-reference
 *
 * `unknown-reference` is also caught by `aontu relations` at build. Both are
 * kept: the model catches it in vetted data, this catches it in USER data at
 * runtime (SPEC 16.1 says so explicitly).
 */

import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Fixture, Row, ValidateInput, fixRef, quoted, ref } from './input'

export const UNKNOWN = 'unknown-reference'
export const CROSS_TENANT = 'cross-tenant-reference'

type Link = { field: string; canon: string; id: string }

function linksOf(f: Fixture): Link[] {
  const out: Link[] = []
  if (null != f.parent_id && '' !== f.parent_id)
    out.push({ field: 'parent_id', canon: 'cag/fixture', id: String(f.parent_id) })
  if (null != f.room_id && '' !== f.room_id)
    out.push({ field: 'room_id', canon: 'cag/room', id: String(f.room_id) })
  if (null != f.track_id && '' !== f.track_id)
    out.push({ field: 'track_id', canon: 'cag/track', id: String(f.track_id) })
  return out
}

export function references(input: ValidateInput): Diagnostic[] {
  const { top, segments, rooms, tracks, speakers, appearances } = input
  const all = [top, ...segments]

  const index = new Map<string, Map<string, Row>>([
    ['cag/fixture', new Map(all.map((f) => [f.id, f as Row]))],
    ['cag/room', new Map(rooms.map((r) => [r.id, r]))],
    ['cag/track', new Map(tracks.map((t) => [t.id, t]))],
    ['cag/speaker', new Map(speakers.map((s) => [s.id, s]))],
  ])

  const out: Diagnostic[] = []

  const check = (owner: Fixture | Row, ownerRef: any, link: Link) => {
    const target = index.get(link.canon)?.get(link.id)

    if (null == target) {
      out.push({
        rule: UNKNOWN,
        severity: 'error',
        message:
          'References a ' + link.canon.split('/')[1] + ' that does not exist: ' + link.id + '.',
        entity: ownerRef,
        related: [ownerRef, ref(link.canon, link.id)],
        fix: 'Point ' + link.field + ' at something that exists, or clear it.',
        data: { field: link.field, canon: link.canon, id: link.id },
      })
      return
    }

    // Existence is not enough. A user with access to two orgs must not be able
    // to graft one org's tree onto another's room (SPEC 16.1). Checked at save
    // time as well as here.
    const ownerOrg = (owner as any).org_id
    if (null != ownerOrg && null != target.org_id && ownerOrg !== target.org_id) {
      out.push({
        rule: CROSS_TENANT,
        severity: 'error',
        message:
          'References a ' + link.canon.split('/')[1] + ' belonging to another organisation.',
        entity: ownerRef,
        related: [ownerRef, ref(link.canon, link.id, String(target.name ?? ''))],
        fix: 'Use a ' + link.canon.split('/')[1] + ' from this organisation.',
        data: { field: link.field, org_id: ownerOrg, target_org_id: target.org_id },
      })
    }
  }

  for (const f of all) {
    for (const link of linksOf(f)) check(f, fixRef(f), link)
  }

  for (const a of appearances) {
    const owner = ref('cag/appearance', a.id)
    check(a, owner, { field: 'fixture_id', canon: 'cag/fixture', id: String(a.fixture_id) })
    check(a, owner, { field: 'speaker_id', canon: 'cag/speaker', id: String(a.speaker_id) })
  }

  return sortDiagnostics(out)
}
