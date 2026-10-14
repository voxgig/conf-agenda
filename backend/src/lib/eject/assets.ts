/* Vendoring an agenda's assets into an ejected bundle. SPEC 12 and 16.1.
 *
 * Vendoring copies a dependency into the artifact that uses it, so the
 * artifact no longer resolves it at runtime: every asset the agenda refers to
 * is read or fetched ONCE, here, written under `assets/`, and the reference
 * rewritten to the relative path. That is what makes the README's "no request
 * leaves the page" a property of the files rather than a claim.
 *
 * ALL OR NOTHING. An asset that cannot be vendored refuses the whole eject,
 * naming it. A half-vendored bundle makes requests when it is opened, which is
 * the one thing SPEC 12 says it does not do.
 *
 * NO IO OF ITS OWN. The containment check, the file read and the fetcher are
 * all handed in, so this is testable with fakes and the handler stays the one
 * place that touches the disk and the network. `check` is makeAssetCheck from
 * src/lib/assets.ts, unchanged: containment is judged on the canonical path,
 * so a symlink inside the root pointing outside it is refused here exactly as
 * `asset-escapes-root` refuses it at publish.
 */

import { createHash } from 'node:crypto'
import Path from 'node:path'

import type { AssetCheck } from '../assets'
import { ASSETS_DIR } from './manifest'

/** The asset fields agenda.json carries. The same list as ASSET_FIELDS in
 *  src/lib/validate/assets.ts, read from the published shape rather than the
 *  rows. `w_site`, `w_video` and `w_deck` are links a reader follows, not
 *  files the page loads, so they are not here. */
const AGENDA_ASSET_FIELDS: { list: string; field: string }[] = [
  { list: 'speakers', field: 'photo' },
]

const HTTP = /^https?:\/\//i
const INLINE = /^data:/i

export type Fetcher = (url: string) => Promise<{
  ok: boolean
  status: number
  arrayBuffer(): Promise<ArrayBuffer>
}>

export type VendorDeps = {
  check: AssetCheck
  /** Read a local asset, given the value as the agenda carries it. */
  read: (path: string) => Buffer
  fetch: Fetcher
}

/** Why an asset could not be vendored, with the asset named. */
export class AssetRefusal extends Error {
  why: 'asset-unavailable' | 'asset-escapes-root'
  asset: string

  constructor(why: AssetRefusal['why'], asset: string, detail: string) {
    super(why + ': ' + JSON.stringify(asset) + ' ' + detail)
    this.why = why
    this.asset = asset
  }
}

/** Every asset value the agenda refers to, once each, in a stable order. */
export function collectAssets(agenda: any): string[] {
  const seen = new Set<string>()
  for (const { list, field } of AGENDA_ASSET_FIELDS) {
    for (const row of (agenda && agenda[list]) || []) {
      const value = row && row[field]
      if ('string' !== typeof value || '' === value.trim()) continue
      // A data: URI carries its own bytes and makes no request.
      if (INLINE.test(value.trim())) continue
      seen.add(value)
    }
  }
  return [...seen]
}

/** The vendored name, derived from the reference: collision-free, and keeping the
 *  extension so a browser and a host serve it with the right type. */
function vendoredPath(value: string): string {
  const raw = value.trim()
  let pathname = raw
  if (HTTP.test(raw)) {
    try {
      pathname = new URL(raw).pathname
    } catch (e) {
      pathname = ''
    }
  }
  const ext = Path.extname(pathname).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  return ASSETS_DIR + hash + ext
}

export async function vendorAssets(
  agenda: any,
  deps: VendorDeps,
): Promise<{ files: Map<string, Buffer>; rewrites: Map<string, string> }> {
  const files = new Map<string, Buffer>()
  const rewrites = new Map<string, string>()

  for (const value of collectAssets(agenda)) {
    const raw = value.trim()
    let bytes: Buffer

    if (HTTP.test(raw)) {
      try {
        const res = await deps.fetch(raw)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        bytes = Buffer.from(await res.arrayBuffer())
      } catch (err: any) {
        throw new AssetRefusal('asset-unavailable', value,
          'could not be downloaded (' + (err && err.message || err) + ')')
      }
    } else {
      const fact = deps.check(raw)

      // Any other scheme (ftp://, file://) is neither ours to read nor
      // something we fetch, and leaving it would leave a request in the page.
      if (!fact.local) {
        throw new AssetRefusal('asset-unavailable', value, 'is not an http(s) URL or a local path')
      }
      // Containment first, as at publish: an escaping file that exists is
      // the dangerous case, and it must never be copied.
      if (!fact.contained) {
        throw new AssetRefusal('asset-escapes-root', value, 'resolves outside the assets root')
      }
      if (!fact.exists) {
        throw new AssetRefusal('asset-unavailable', value, 'does not exist')
      }
      try {
        bytes = deps.read(raw)
      } catch (err: any) {
        throw new AssetRefusal('asset-unavailable', value,
          'could not be read (' + (err && err.message || err) + ')')
      }
    }

    const path = vendoredPath(value)
    files.set(path, bytes)
    rewrites.set(value, path)
  }

  return { files, rewrites }
}

/** The agenda with each vendored reference replaced by its relative path.
 *  Returns a copy; the input is left as it was. */
export function rewriteAgenda(agenda: any, rewrites: Map<string, string>): any {
  const out = JSON.parse(JSON.stringify(agenda))
  for (const { list, field } of AGENDA_ASSET_FIELDS) {
    for (const row of out[list] || []) {
      if (row && rewrites.has(row[field])) row[field] = rewrites.get(row[field])
    }
  }
  return out
}
