// SPEC 11.2: under 30KB gzipped, enforced by a CI size check. The budget is
// the point - an embed runs on someone else's marketing site.
import { readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET = 30 * 1024
const files = ['dist/conf-agenda.umd.cjs', 'dist/conf-agenda.mjs']

let failed = false
for (const f of files) {
  const raw = statSync(f).size
  const gz = gzipSync(readFileSync(f)).length
  const pct = ((gz / BUDGET) * 100).toFixed(1)
  const ok = gz <= BUDGET
  if (!ok) failed = true
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${f}  raw ${(raw / 1024).toFixed(1)}KB  gzip ${(gz / 1024).toFixed(1)}KB  (${pct}% of 30KB)`,
  )
}
process.exit(failed ? 1 : 0)
