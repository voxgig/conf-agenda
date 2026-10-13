import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import Fs from 'node:fs'
import Path from 'node:path'
import Os from 'node:os'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const AgendaSrv = require('../../dist/srv/agenda/agenda-srv.js')

// The CLI is a real surface (PLATFORM 4), so it gets real tests: run the
// binary, check what it prints and what it EXITS WITH. The exit code is the
// whole point of a validate command - it is what CI gates on.

const CLI = Path.join(process.cwd(), 'bin/conf-agenda.mjs')
const TINY = Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json')

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (err: any) {
    return { code: err.status, out: String(err.stdout || '') + String(err.stderr || '') }
  }
}

/** tiny with its deliberate clash resolved, written to a temp file. */
function cleanFixture(): string {
  const f = JSON.parse(Fs.readFileSync(TINY, 'utf8'))
  const seg = f['cag/fixture'].find((x: any) => 'seg_d1edge' === x.id)
  seg.t_start = 1825239600000
  seg.t_end = 1825243200000
  const p = Path.join(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'ca-')), 'clean.json')
  Fs.writeFileSync(p, JSON.stringify(f))
  return p
}

/** The manifest eject:fixture returns for a fixture file, posted in-process. */
async function manifestFor(file: string): Promise<Record<string, string>> {
  const bundle = JSON.parse(Fs.readFileSync(file, 'utf8'))
  const seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  seneca.use(AgendaSrv)
  await seneca.ready()
  for (const canon of Object.keys(bundle)) {
    if (canon.startsWith('_') || !Array.isArray(bundle[canon])) continue
    for (const row of bundle[canon]) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  assert.equal((await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })).ok, true)
  const out = await seneca.post('aim:cag,eject:fixture', { fixture_id: 'conf_tiny' })
  await seneca.close()
  assert.equal(out.ok, true)
  return out.manifest
}

/** Every path under a directory, relative, directories with a trailing `/`. */
function walk(root: string, rel = ''): string[] {
  const out: string[] = []
  for (const e of Fs.readdirSync(Path.join(root, rel), { withFileTypes: true })) {
    const p = rel + e.name
    if (e.isDirectory()) out.push(p + '/', ...walk(root, p + '/'))
    else out.push(p)
  }
  return out
}

describe('cli', () => {
  test('validate EXITS 1 on a validation error, and names both sides', () => {
    const r = run(['validate', TINY])
    assert.equal(r.code, 1, 'CI gates on this')
    assert.match(r.out, /room-double-booked/)
    assert.match(r.out, /Message Buses in the Browser/)
    assert.match(r.out, /D1 at the Edge/)
    assert.match(r.out, /fix:/, 'and says what to do about it')
  })

  test('validate exits 0 on a clean programme', () => {
    const r = run(['validate', cleanFixture()])
    assert.equal(r.code, 0)
    assert.match(r.out, /no errors/)
  })

  test('publish is blocked by validation, and exits 1', () => {
    const r = run(['publish', TINY])
    assert.equal(r.code, 1)
    assert.match(r.out, /publication blocked/)
  })

  test('publish emits the agenda with --json, and no speaker email', () => {
    const r = run(['publish', cleanFixture(), '--json'])
    assert.equal(r.code, 0)
    const agenda = JSON.parse(r.out)
    assert.equal(agenda.schemaVersion, 1)
    assert.equal(agenda.sessions.length, 4)
    assert.ok(!r.out.includes('@'), 'C6 holds on the CLI surface too')
  })

  test('--json output is machine-readable and carries the diagnostics', () => {
    const r = run(['validate', TINY, '--json'])
    assert.equal(r.code, 1)
    const out = JSON.parse(r.out)
    assert.equal(out.valid, false)
    assert.equal(out.error_count, 1)
    assert.equal(out.diagnostics[0].rule, 'room-double-booked')
  })

  test('a missing file and an unknown command both fail cleanly', () => {
    const missing = run(['validate', '/no/such/file.json'])
    assert.equal(missing.code, 1)
    assert.match(missing.out, /no such file/)

    const unknown = run(['frobnicate', TINY])
    assert.equal(unknown.code, 1)
    assert.match(unknown.out, /unknown command/)
  })

  test('eject writes exactly the manifest the message returned, byte for byte', async () => {
    const file = cleanFixture()
    const dir = Path.join(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'ca-eject-')), 'agenda')

    const r = run(['eject', file, '--out', dir])
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /ejected tiny-conf-2027/)

    const manifest = await manifestFor(file)
    assert.ok(0 < Object.keys(manifest).length)
    assert.deepEqual(walk(dir).sort(), Object.keys(manifest).sort())
    for (const [rel, content] of Object.entries(manifest)) {
      if (rel.endsWith('/')) continue
      assert.equal(Fs.readFileSync(Path.join(dir, rel), 'utf8'), content, rel)
    }
  })

  test('eject refuses a non-empty --out, naming it, and leaves it alone', () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'ca-eject-'))
    Fs.writeFileSync(Path.join(dir, 'keep.txt'), 'mine')

    const r = run(['eject', cleanFixture(), '--out', dir])
    assert.notEqual(r.code, 0)
    assert.ok(r.out.includes(dir), 'names the directory: ' + r.out)
    assert.deepEqual(Fs.readdirSync(dir), ['keep.txt'], 'nothing merged in')
  })

  test('eject without --out, or blocked by validation, fails cleanly', () => {
    const noOut = run(['eject', cleanFixture()])
    assert.equal(noOut.code, 1)
    assert.match(noOut.out, /needs --out/)

    const dir = Path.join(Fs.mkdtempSync(Path.join(Os.tmpdir(), 'ca-eject-')), 'agenda')
    const blocked = run(['eject', TINY, '--out', dir])
    assert.equal(blocked.code, 1)
    assert.match(blocked.out, /no bundle/)
    assert.equal(Fs.existsSync(dir), false, 'nothing written')
  })

  test('--help lists eject', () => {
    assert.match(run(['--help']).out, /^\s+eject\s+<fixture\.json>/m)
  })
})
