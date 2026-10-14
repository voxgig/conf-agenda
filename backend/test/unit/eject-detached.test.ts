import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'
import { builtinModules } from 'node:module'

// Top-level on purpose: `npm test` globs dist-test/unit/*.test.js one level
// only, so a test under unit/lib/ would never run in the gate.

const {
  buildDetached, exportFixture, detachedReadme, RUNNER_DIRS, RUNNER_FILES, RUNNER_DEPS, BACKEND_DIR,
  SITE_DIR,
} = require('../../dist/lib/eject/detached.js')

const SNAPSHOT = new Map<string, string>([
  ['index.html', '<html></html>'],
  ['conf-agenda.js', '/* component */'],
  ['agenda.json', '{}'],
  ['agenda.ics', 'BEGIN:VCALENDAR'],
  ['agenda.csv', 'id'],
  ['assets/', ''],
  ['README.md', '# Tiny Conf\n'],
  ['LICENSE', 'MIT License'],
])

const PKG = JSON.parse(Fs.readFileSync(Path.join(process.cwd(), 'package.json'), 'utf8'))

const build = (over: any = {}) => buildDetached({
  snapshot: SNAPSHOT,
  fixture: { 'cag/fixture': [{ id: 'conf_tiny' }] },
  runner: new Map([['dist/env/local/local.js', '/* runner */']]),
  pkg: PKG,
  node: 'v24.19.0',
  ...over,
})

describe('eject-detached', () => {
  test('eject-detached: every snapshot entry is under site/, byte for byte', () => {
    const out = build()
    const keys = [...out.keys()]
    assert.ok(keys.length > SNAPSHOT.size, 'strictly more entries')

    for (const [k, v] of SNAPSHOT) {
      assert.ok(out.has(SITE_DIR + k), 'snapshot entry kept: ' + SITE_DIR + k)
      assert.equal(out.get(SITE_DIR + k), v, SITE_DIR + k)
    }
  })

  test('eject-detached: nothing but site/ is hostable, and the data is not in it', () => {
    const keys = [...build().keys()]

    // THE WHOLE POINT of the two directories: `backend/fixture.json` carries
    // sessions the published agenda withholds, so an organiser who uploads
    // site/ cannot publish them by accident. Prose cannot enforce that.
    const outside = keys.filter((k) => !k.startsWith(SITE_DIR))
    assert.deepEqual(outside.filter((k) => !k.startsWith(BACKEND_DIR) && 'README.md' !== k), [])
    assert.ok(!keys.some((k) => k.startsWith(SITE_DIR) && k.includes('fixture.json')),
      'the editable fixture is never under site/')
    for (const k of ['backend/dist/env/local/local.js', 'backend/fixture.json',
      'backend/package.json', 'backend/run.sh']) {
      assert.ok(keys.includes(k), k)
    }
    // Known-present: site/ really did get the hostable files.
    assert.ok(keys.includes('site/index.html') && keys.includes('site/agenda.json'))
  })

  test('eject-detached: the README section names the runtime and what to supply', () => {
    const readme = build().get('README.md')
    assert.ok(readme.startsWith('# Tiny Conf\n'), 'the snapshot README comes first')
    assert.match(readme, /## Running it yourself \(detached mode\)/)
    assert.match(readme, /targets Node\.js v24\.19\.0 or later/)
    // The instruction is positive and names the directory, because that is
    // what the two-directory layout buys: not a warning to obey, a path to use.
    assert.match(readme, /Publish `site\/`\. Nothing else here is for hosting\./)
    assert.match(readme, /private sessions the published agenda leaves out/)
    assert.match(readme, /You supply:/)
    assert.equal(detachedReadme('v24.19.0'), readme.slice('# Tiny Conf\n'.length))
  })

  test('eject-detached: package.json names only the runner dependencies, at the backend versions', () => {
    const pkg = JSON.parse(build().get('backend/package.json'))
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), [...RUNNER_DEPS].sort())
    for (const name of RUNNER_DEPS) assert.equal(pkg.dependencies[name], PKG.dependencies[name])
    // Known-absent: a backend dependency the runner does not load.
    assert.ok(PKG.dependencies.express, 'express is a backend dependency')
    assert.equal(pkg.dependencies.express, undefined)
    assert.equal(pkg.engines.node, '>=24')
    assert.equal(pkg.license, 'MIT', 'the bundle LICENSE is MIT')
  })

  test('eject-detached: a runner dependency missing from the backend refuses, naming it', () => {
    const pkg = { ...PKG, dependencies: { ...PKG.dependencies } }
    delete pkg.dependencies['@seneca/owner']
    assert.throws(() => build({ pkg }), /runner dependency missing.*@seneca\/owner/)
  })

  test('eject-detached: RUNNER_DEPS covers every package the shipped files require', () => {
    // The real build, read the way the handler reads it.
    const files: string[] = []
    const walk = (rel: string) => {
      for (const ent of Fs.readdirSync(rel, { withFileTypes: true })) {
        const p = rel + '/' + ent.name
        if (ent.isDirectory()) walk(p)
        else if (p.endsWith('.js')) files.push(p)
      }
    }
    RUNNER_DIRS.forEach(walk)
    files.push(...RUNNER_FILES.filter((f: string) => /\.(m?js)$/.test(f) && !f.startsWith('asset/')))

    const required = new Set<string>()
    for (const f of files) {
      const src = Fs.readFileSync(f, 'utf8')
      const calls = src.matchAll(/require\(["']([^"'.][^"']*)["']\)/g)
      const imports = src.matchAll(/^\s*import\b[^'"\n]*from\s+["']([^"'.][^"']*)["']/gm)
      for (const m of [...calls, ...imports]) {
        const spec = m[1]
        if (spec.startsWith('node:') || builtinModules.includes(spec)) continue
        required.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
      }
    }
    // Known-present: the scan finds what it is looking for at all.
    assert.ok(required.has('seneca'), 'the scan sees the CLI requiring seneca')
    assert.ok(required.has('@voxgig/system'))
    // Known-absent: the web runner's express is not shipped.
    assert.ok(!required.has('express'))
    assert.deepEqual([...required].filter((r) => !RUNNER_DEPS.includes(r)), [])
  })

  test('eject-detached: the exported fixture blanks every email and points photos at the vendored copy', () => {
    const rows = {
      'cag/speaker': [
        { id: 'sp1', email: 'ada@example.test', photo: 'ada.jpg' },
        { id: 'sp2', email: 'grace@example.test', photo: 'https://cdn.example.test/g.png' },
        { id: 'sp3', email: 'lin@example.test' },
      ],
      'cag/fixture': [{ id: 'conf_tiny' }],
    }
    const rewrites = new Map([
      ['ada.jpg', 'assets/0123456789abcdef.jpg'],
      ['https://cdn.example.test/g.png', 'assets/fedcba9876543210.png'],
    ])
    const out = exportFixture(rows, rewrites)
    assert.deepEqual(out['cag/speaker'].map((s: any) => s.email), ['', '', ''])
    assert.deepEqual(out['cag/speaker'].map((s: any) => s.photo),
      ['0123456789abcdef.jpg', 'fedcba9876543210.png', undefined])
    assert.equal(rows['cag/speaker'][0].email, 'ada@example.test', 'the input is left as it was')
    assert.deepEqual(out['cag/fixture'], rows['cag/fixture'])
  })
})
