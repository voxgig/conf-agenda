import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import Fs from 'node:fs'
import Path from 'node:path'
import Os from 'node:os'

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
})
