//// aim:cag,eject:fixture - take a published conference out as a bundle.
////
//// SPEC 12. Returns a MANIFEST, relative path to content, and writes nothing:
//// the CLI writes it to disk, so this message is reachable from every surface
//// without a writable directory.
////
//// It reads the STORED snapshot and never recomputes it, so the bundle is
//// what was published, frozen. No snapshot means `not-published` - the same
//// word get:feed uses - and never a publish on the organiser's behalf, which
//// would turn a read into a write.
////
//// Every asset the agenda refers to is vendored into `assets/` and the
//// reference rewritten, or the eject refuses naming the asset: a bundle that
//// still points elsewhere makes requests when opened. The fetcher is global
//// `fetch` unless the plugin options supply one (`eject: { fetch }`), which
//// is how a test drives it without the network.
////
//// `detached` adds the compiled runner, the CLI and the conference's rows
//// under `backend/` (src/lib/eject/detached.ts). Those rows are the live
//// tree, not the snapshot: they are what the organiser keeps editing.

import Fs from 'node:fs'
import Path from 'node:path'

const { buildManifest, MODES } = require('../../lib/eject/manifest')
const { vendorAssets, rewriteAgenda, AssetRefusal } = require('../../lib/eject/assets')
const { makeAssetCheck } = require('../../lib/assets')
const { buildDetached, exportFixture, RUNNER_DIRS, RUNNER_FILES } = require('../../lib/eject/detached')

//// dist/srv/cag -> backend/.
const BACKEND = Path.join(__dirname, '../../..')

//// Copied in by tool/copy-embed.mjs at build time.
const COMPONENT = Path.join(BACKEND, 'asset/conf-agenda.js')

//// The same assets root validate:fixture checks containment against.
function assetsRoot(seneca: any): string {
  const conf = seneca.context && seneca.context.model
    && seneca.context.model.main && seneca.context.model.main.conf
  return (conf && conf.assets && conf.assets.root) || 'assets'
}

module.exports = function make_eject_fixture(ctx: any) {
  const options = (ctx && ctx.options) || {}
  const fetcher = (options.eject && options.eject.fetch) || ((url: string) => fetch(url))

  return async function eject_fixture(this: any, msg: any) {
    const seneca = this
    const mode = null == msg.mode || '' === msg.mode ? 'snapshot' : msg.mode

    if (!MODES.includes(mode)) {
      return { ok: false, why: 'unknown-mode', mode, modes: MODES }
    }

    // Tenancy and slug from the stored row, never the payload.
    const top = await seneca.entity('cag/fixture').load$(msg.fixture_id)
    if (null == top) return { ok: false, why: 'not-found' }

    const snapshot = await seneca.entity('cag/snapshot').load$(top.org_id + ':' + top.slug)
    if (null == snapshot) {
      return { ok: false, why: 'not-published' }
    }

    if (!Fs.existsSync(COMPONENT)) {
      return { ok: false, why: 'no-component', fix: 'cd embed && npm run build, then rebuild backend' }
    }

    const root = Path.resolve(assetsRoot(seneca))
    const parsed = JSON.parse(snapshot.agenda_json)
    let vendored
    try {
      vendored = await vendorAssets(parsed, {
        check: makeAssetCheck(root),
        read: (path: string) => Fs.readFileSync(Path.resolve(root, path)),
        fetch: fetcher,
      })
    } catch (err: any) {
      if (err instanceof AssetRefusal) {
        return { ok: false, why: err.why, asset: err.asset, detail: err.message }
      }
      throw err
    }

    // With nothing to vendor, the stored string goes out byte for byte;
    // otherwise it is re-serialised the way publish:fixture wrote it.
    const agenda = 0 === vendored.rewrites.size
      ? snapshot.agenda_json
      : JSON.stringify(rewriteAgenda(parsed, vendored.rewrites))

    const manifest = buildManifest({
      agenda,
      mode,
      component: Fs.readFileSync(COMPONENT, 'utf8'),
      assets: vendored.files,
    })

    if ('snapshot' === mode) {
      return { ok: true, mode, manifest: Object.fromEntries(manifest) }
    }

    const detached = buildDetached({
      snapshot: manifest,
      fixture: exportFixture(await treeRows(seneca, top), vendored.rewrites),
      runner: readRunner(),
      pkg: JSON.parse(Fs.readFileSync(Path.join(BACKEND, 'package.json'), 'utf8')),
      node: process.version,
    })

    return { ok: true, mode, manifest: Object.fromEntries(detached) }
  }
}

//// The conference's rows, keyed by canon the way the CLI reads a fixture
//// file: its tree, the appearances in it and their speakers, and the org's
//// rooms and tracks (publish:fixture reads those org-wide too).
async function treeRows(seneca: any, top: any) {
  const tree = await seneca.post('concern:fixture,resolve:tree', { fixture_id: top.id })
  const ids = new Set((tree.nodes || []).map((n: any) => n.id))
  const q = { org_id: top.org_id }
  const plain = async (canon: string) =>
    (await seneca.entity(canon).list$(q))
      .map((r: any) => r.data$(false))
      .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))

  const fixtures = (await plain('cag/fixture')).filter((f: any) => ids.has(f.id))
  const appearances = (await plain('cag/appearance')).filter((a: any) => ids.has(a.fixture_id))
  const speaker_ids = new Set(appearances.map((a: any) => a.speaker_id))

  return {
    'cag/room': await plain('cag/room'),
    'cag/track': await plain('cag/track'),
    'cag/speaker': (await plain('cag/speaker')).filter((s: any) => speaker_ids.has(s.id)),
    'cag/fixture': fixtures,
    'cag/appearance': appearances,
  }
}

//// The runner's files from this backend's own build, keyed by their path
//// under it. A missing one throws: a detached bundle without it cannot run.
function readRunner() {
  const runner = new Map()
  const walk = (rel: string) => {
    for (const ent of Fs.readdirSync(Path.join(BACKEND, rel), { withFileTypes: true })) {
      const path = rel + '/' + ent.name
      if (ent.isDirectory()) walk(path)
      else if (path.endsWith('.js')) runner.set(path, Fs.readFileSync(Path.join(BACKEND, path), 'utf8'))
    }
  }
  RUNNER_DIRS.forEach(walk)
  for (const path of RUNNER_FILES) {
    runner.set(path, Fs.readFileSync(Path.join(BACKEND, path), 'utf8'))
  }
  return runner
}
