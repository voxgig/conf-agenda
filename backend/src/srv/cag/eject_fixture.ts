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

import Fs from 'node:fs'
import Path from 'node:path'

const { buildManifest, MODES } = require('../../lib/eject/manifest')
const { vendorAssets, rewriteAgenda, AssetRefusal } = require('../../lib/eject/assets')
const { makeAssetCheck } = require('../../lib/assets')

//// Copied in by tool/copy-embed.mjs at build time; dist/srv/cag -> backend/.
const COMPONENT = Path.join(__dirname, '../../../asset/conf-agenda.js')

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

    return { ok: true, mode, manifest: Object.fromEntries(manifest) }
  }
}
