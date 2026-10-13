/* The ejected bundle, described before it is written. SPEC 12.
 *
 * A manifest maps a relative path to its content. Building one is PURE: no
 * filesystem, no fetch. The handler gathers the inputs and the CLI writes the
 * result, the same split src/lib/validate/* and src/lib/assets.ts keep, so
 * eject:fixture is reachable from every surface without a writable directory.
 *
 * `assets/` is always an entry of its own, a directory marker with empty
 * content, so the bundle has the directory SPEC 12 names even when the agenda
 * references no asset.
 */

import { buildCsv, buildIcs } from '../ics'
import { buildIndexHtml } from './index_html'
import { buildLicense, buildReadme } from './readme'

export const MODES = ['snapshot', 'detached']

export const ASSETS_DIR = 'assets/'

export type Manifest = Map<string, string | Buffer>

export function buildManifest(input: {
  agenda: string
  mode: string
  component: string | Buffer
  assets?: Manifest
}): Manifest {
  const { agenda, mode, component } = input

  if (!MODES.includes(mode)) {
    throw new Error('unknown eject mode "' + mode + '"; valid modes: ' + MODES.join(', '))
  }

  // The stored snapshot string, byte for byte: the bundle carries what was
  // published, never a re-serialisation of it.
  const parsed = JSON.parse(agenda)
  const conf = parsed.conference || {}
  const title = conf.title || conf.slug || 'Agenda'

  const manifest: Manifest = new Map()
  manifest.set('index.html', buildIndexHtml({ title, agenda_json: agenda }))
  manifest.set('conf-agenda.js', component)
  manifest.set('agenda.json', agenda)
  manifest.set('agenda.ics', buildIcs(parsed))
  manifest.set('agenda.csv', buildCsv(parsed))
  manifest.set(ASSETS_DIR, '')
  for (const [path, content] of input.assets || new Map()) {
    if (!path.startsWith(ASSETS_DIR) || path === ASSETS_DIR) {
      throw new Error('asset path outside ' + ASSETS_DIR + ': ' + path)
    }
    manifest.set(path, content)
  }
  manifest.set('README.md', buildReadme({ title, slug: conf.slug || '' }))
  manifest.set('LICENSE', buildLicense())

  return manifest
}
