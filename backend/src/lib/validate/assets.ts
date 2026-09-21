/* SPEC 16.1: broken-asset and asset-escapes-root.
 *
 * Two rules, one walk, because they read the same facts about the same paths
 * - and the spec is explicit that they are SEPARATE checks: "Existence is not
 * containment; check both."
 *
 * The filesystem work happens in src/lib/assets.ts and arrives here as facts,
 * so these stay pure functions of their input like every other rule.
 */

import { AssetCheck } from '../assets'
import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Row, ValidateInput, ref } from './input'

export const BROKEN_ASSET = 'broken-asset'
export const ESCAPES_ROOT = 'asset-escapes-root'

/** Every asset path the model carries, and where it lives. */
const ASSET_FIELDS: { canon: string; from: keyof ValidateInput; field: string }[] = [
  { canon: 'cag/speaker', from: 'speakers', field: 'photo' },
]

export function assets(input: ValidateInput, check?: AssetCheck): Diagnostic[] {
  const asset = check || (input as any).asset
  // A rule that cannot run says nothing, and the caller always supplies this.
  // Whether it ran at all is asserted in the test, not assumed here.
  if ('function' !== typeof asset) return []

  const out: Diagnostic[] = []

  for (const spec of ASSET_FIELDS) {
    for (const row of (input[spec.from] as Row[]) || []) {
      const value = row[spec.field]
      if (null == value || '' === String(value).trim()) continue

      const fact = asset(value)
      if (!fact.local) continue

      const name = String(row.name ?? row.id)
      const where = ref(spec.canon, row.id, name)

      // CONTAINMENT FIRST. An escaping path that also exists is the dangerous
      // one, and reporting it as merely "missing" would be the wrong story.
      if (!fact.contained) {
        out.push({
          rule: ESCAPES_ROOT,
          severity: 'error',
          message: name + "'s " + spec.field + ' resolves outside the assets root: ' +
            JSON.stringify(String(value)) + '.',
          entity: where,
          related: [where],
          fix: 'Move the file inside the assets root and point at it from there.',
          data: { field: spec.field, path: String(value), exists: fact.exists },
        })
        continue
      }

      if (!fact.exists) {
        out.push({
          rule: BROKEN_ASSET,
          severity: 'error',
          message: name + "'s " + spec.field + ' does not resolve: ' +
            JSON.stringify(String(value)) + '.',
          entity: where,
          related: [where],
          fix: 'Upload the file, or clear the field.',
          data: { field: spec.field, path: String(value) },
        })
      }
    }
  }

  return sortDiagnostics(out)
}
