#!/usr/bin/env node
/* conf-agenda CLI. PLATFORM 4 lists the CLI as one of the six surfaces, and
 * SPEC 19.3 asks for `validate` at Stage 1.
 *
 * Every command posts the SAME message the app, the API and the REPL post -
 * that is the point of the binding registry idea in SPEC 13.1: an action
 * reachable from one surface is reachable from all of them, because they all
 * post one message. Nothing here reimplements a rule.
 *
 *   conf-agenda validate <fixture.json> [--json]
 *   conf-agenda publish  <fixture.json> [--json]
 *
 * A fixture file is a canon-keyed bundle of rows (test/fixtures/tiny/tiny.json
 * is the worked example). It is loaded into an in-memory store, so the command
 * is hermetic: no server, no network, safe in CI.
 */
import Fs from 'node:fs'
import Path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const HERE = Path.dirname(new URL(import.meta.url).pathname)

const USAGE = `Usage: conf-agenda <command> [options]

  validate <fixture.json>   run the validation rules; exit 1 if any ERROR
  publish  <fixture.json>   validate, then build the published snapshot

Options:
  --fixture <id>   top fixture to act on (default: the first conference found)
  --json           machine-readable output
  -h, --help
`

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('-')))
const rest = args.filter((a) => !a.startsWith('-'))
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return -1 === i ? dflt : args[i + 1]
}

if (0 === rest.length || flags.has('-h') || flags.has('--help')) {
  console.log(USAGE)
  process.exit(rest.length ? 0 : 1)
}

const [cmd, file] = rest
const asJson = flags.has('--json')

if (!['validate', 'publish'].includes(cmd)) {
  console.error('conf-agenda: unknown command "' + cmd + '"\n')
  console.error(USAGE)
  process.exit(1)
}
if (!file) {
  console.error('conf-agenda: ' + cmd + ' needs a fixture file\n')
  process.exit(1)
}
if (!Fs.existsSync(file)) {
  console.error('conf-agenda: no such file: ' + file)
  process.exit(1)
}

const Seneca = require('seneca')
const Model = require(Path.join(HERE, '../model/model.json'))
const { basic } = require(Path.join(HERE, '../dist/env/shared/basic.js'))
const CagSrv = require(Path.join(HERE, '../dist/srv/cag/cag-srv.js'))

const bundle = JSON.parse(Fs.readFileSync(file, 'utf8'))

const seneca = Seneca({ legacy: false, timeout: 22222 })
seneca.context.model = Model
seneca.context.env = 'cli'
seneca.context.srvname = 'cag'
seneca.test()
basic(seneca)
seneca.use(CagSrv)
await seneca.ready()

let loaded = 0
for (const canon of Object.keys(bundle)) {
  if (canon.startsWith('_') || !Array.isArray(bundle[canon])) continue
  for (const row of bundle[canon]) {
    await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    loaded++
  }
}

// The top fixture to act on: named, or the first conference in the bundle.
const tops = (await seneca.entity('cag/fixture').list$({}))
  .map((r) => r.data$(false))
  .filter((f) => null == f.parent_id || '' === f.parent_id)
  .sort((a, b) => (a.id < b.id ? -1 : 1))

const fixture_id = opt('fixture', tops[0] && tops[0].id)
if (null == fixture_id) {
  console.error('conf-agenda: no conference in ' + file)
  process.exit(1)
}

const SEV = { error: 'ERROR', warn: 'WARN ' }

function report(out) {
  if (asJson) {
    console.log(JSON.stringify(out, null, 2))
    return
  }
  for (const d of out.diagnostics || []) {
    console.log(`${SEV[d.severity] || d.severity}  ${d.rule}`)
    console.log(`       ${d.message}`)
    console.log(`       fix: ${d.fix}`)
    console.log()
  }
}

if ('validate' === cmd) {
  const out = await seneca.post('aim:cag,validate:fixture', { fixture_id })
  if (!out.ok) {
    console.error('conf-agenda: ' + out.why)
    process.exit(1)
  }
  report(out)
  if (!asJson) {
    console.log(
      out.valid
        ? `OK  ${fixture_id}: no errors (${loaded} rows, ${out.warn_count} warning(s))`
        : `FAIL  ${fixture_id}: ${out.error_count} error(s), ${out.warn_count} warning(s)`,
    )
  }
  // Non-zero on errors, so CI can gate on it - the whole reason a validate
  // command exists as a command.
  process.exit(out.valid ? 0 : 1)
}

if ('publish' === cmd) {
  const out = await seneca.post('aim:cag,publish:fixture', { fixture_id })
  if (!out.ok) {
    if ('validation-failed' === out.why) {
      report(out)
      console.error(`FAIL  publication blocked: ${out.error_count} error(s)`)
    } else {
      console.error('conf-agenda: ' + out.why)
    }
    process.exit(1)
  }
  if (asJson) {
    const snap = await seneca.entity('cag/snapshot').load$(out.snapshot_id)
    console.log(snap.agenda_json)
  } else {
    console.log(`OK  published ${out.slug}: ${out.session_count} session(s)`)
  }
  process.exit(0)
}
