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

import Fs from 'node:fs'
import Path from 'node:path'

const { buildManifest, MODES } = require('../../lib/eject/manifest')

//// Copied in by tool/copy-embed.mjs at build time; dist/srv/cag -> backend/.
const COMPONENT = Path.join(__dirname, '../../../asset/conf-agenda.js')

module.exports = function make_eject_fixture() {
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

    const manifest = buildManifest({
      agenda: snapshot.agenda_json,
      mode,
      component: Fs.readFileSync(COMPONENT, 'utf8'),
    })

    return { ok: true, mode, manifest: Object.fromEntries(manifest) }
  }
}
