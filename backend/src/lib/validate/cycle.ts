/* SPEC 16.1: fixture-cycle.
 *
 * THE RUNTIME PAIR OF THE ONTOLOGY'S `contains: acyclic`. The save-time guard
 * (concern:fixture,check:cycle, called by every intent that changes a
 * parent_id) is what stops one being CREATED. This is what finds one that is
 * already there - imported data, an API client, a restored backup - because
 * after storing, every tree resolver and clone:fixture recurses for ever.
 *
 * It reports each cycle ONCE, anchored on its lowest-sorting member, rather
 * than once per member. A three-node cycle is one problem, and three
 * diagnostics saying so is three times the noise and no more information.
 */

import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Fixture, ValidateInput, fixRef, quoted } from './input'

export const CYCLE = 'fixture-cycle'

export function cycles(input: ValidateInput): Diagnostic[] {
  const all: Fixture[] = [input.top, ...input.segments]
  const byId = new Map(all.map((f) => [f.id, f]))

  const out: Diagnostic[] = []
  const reported = new Set<string>()

  for (const start of all) {
    // Walk this node's ancestor chain, bounded by the number of nodes there
    // are: a chain longer than that has already revisited something.
    const seen: string[] = []
    let at: Fixture | undefined = start

    while (null != at) {
      if (seen.includes(at.id)) {
        // The cycle is the tail of the walk from the repeat onward.
        const ring = seen.slice(seen.indexOf(at.id))
        const key = ring.slice().sort().join(',')
        if (!reported.has(key)) {
          reported.add(key)
          const anchor = byId.get(ring.slice().sort()[0]) as Fixture
          out.push({
            rule: CYCLE,
            severity: 'error',
            message: 1 === ring.length
              ? quoted(anchor) + ' is its own parent.'
              : quoted(anchor) + ' is inside itself: ' +
                ring.map((id) => quoted(byId.get(id) as Fixture)).join(' → ') +
                ' → ' + quoted(anchor) + '.',
            entity: fixRef(anchor),
            related: ring.map((id) => fixRef(byId.get(id) as Fixture)),
            fix: 'Re-parent one of these so the chain reaches the conference.',
            data: { ring },
          })
        }
        break
      }
      seen.push(at.id)
      const parent: string | null | undefined = at.parent_id
      at = null == parent || '' === parent ? undefined : byId.get(String(parent))
    }
  }

  return sortDiagnostics(out)
}
