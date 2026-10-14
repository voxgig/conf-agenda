/* The detached additions to an ejected bundle. SPEC 12.
 *
 * Detached is the snapshot bundle plus what an organiser needs to keep
 * editing without us: the compiled local runner, the CLI, the compiled model,
 * the component the CLI ejects with, and the conference's rows as a fixture
 * file the CLI reads.
 *
 * THE HOSTABLE FILES AND THE DATA ARE IN SEPARATE DIRECTORIES, `site/` and
 * `backend/`, and that separation is the point. `backend/fixture.json` is the
 * editable programme, so it holds sessions `agenda.json` deliberately
 * withholds: a private one never reaches the published snapshot
 * (`src/lib/agenda.ts:77`). Left beside `index.html`, one `aws s3 sync .`
 * publishes them, and a README warning is not a guard. This repo already
 * treats "a private file becomes a published one" structurally: it is why
 * `asset-escapes-root` exists and why containment is judged after resolving
 * symlinks. "Upload `site/`" cannot go wrong the same way.
 *
 * The README is deliberately in both places: `site/README.md` is the
 * snapshot's, describing the bundle to whoever is handed it, and the root one
 * adds the detached section, where an organiser opening the directory finds
 * it.
 *
 * Speaker emails are blanked in the fixture (C6 holds in every mode). The
 * model permits an empty email (`valid: 'Empty'`), so the fixture still
 * loads, and validate reports each one as `speaker-no-email`, a warning that
 * does not block publication.
 *
 * PURE, like manifest.ts: the handler reads the files and passes them in.
 */

import { ASSETS_DIR, Manifest } from './manifest'

export const BACKEND_DIR = 'backend/'

/** Everything an organiser hosts. Nothing else in a detached bundle is for
 *  hosting, which is why it is a directory rather than a warning. */
export const SITE_DIR = 'site/'

/** What the runner and the CLI load, relative to the backend directory. A
 *  directory entry ships every `.js` file under it; source maps and the
 *  web and lambda runners stay behind. */
export const RUNNER_DIRS = ['dist/srv', 'dist/concern', 'dist/lib', 'dist/env/local']
export const RUNNER_FILES = [
  'dist/env/shared/basic.js',
  'bin/conf-agenda.mjs',
  'model/model.json',
  'asset/conf-agenda.js',
]

/** The packages the runner needs. Named, not scanned: basic.ts loads most of
 *  its plugins by name (`.use('entity')`, `.use('owner')`, `.use('repl')`),
 *  which no scan of `require` calls would find. The eject-detached test
 *  checks this list against every static require in the shipped files. */
export const RUNNER_DEPS = [
  'seneca',
  'seneca-entity',
  'seneca-promisify',
  '@seneca/entity-util',
  '@seneca/owner',
  '@seneca/reload',
  '@seneca/repl',
  '@seneca/user',
  '@voxgig/system',
  '@voxgig/util',
  'uuid',
]

/** The fixture rows with every speaker email blanked and each vendored photo
 *  pointed at its copy, relative to the assets root (the CLI's default root
 *  is `assets`, which is the bundle's own `assets/` when run from the bundle
 *  root). Returns a copy. */
export function exportFixture(
  rows: Record<string, any[]>,
  rewrites: Map<string, string>,
): Record<string, any[]> {
  const out: Record<string, any[]> = JSON.parse(JSON.stringify(rows))
  for (const sp of out['cag/speaker'] || []) {
    sp.email = ''
    if (rewrites.has(sp.photo)) {
      sp.photo = (rewrites.get(sp.photo) as string).slice(ASSETS_DIR.length)
    }
  }
  return out
}

export function buildDetached(input: {
  snapshot: Manifest
  fixture: Record<string, any[]>
  runner: Manifest
  pkg: any
  node: string
}): Manifest {
  const { snapshot, fixture, runner, pkg, node } = input

  const deps: Record<string, string> = {}
  for (const name of RUNNER_DEPS) {
    const version = pkg.dependencies && pkg.dependencies[name]
    if (null == version) {
      throw new Error('runner dependency missing from the backend package.json: ' + name)
    }
    deps[name] = version
  }

  const major = (/^v?(\d+)/.exec(node) || [])[1]

  //// Every snapshot entry moves under site/ unchanged, so the hostable
  //// bundle stays exactly the eight entries SPEC 12 names.
  const out: Manifest = new Map()
  for (const [path, content] of snapshot) {
    out.set(SITE_DIR + path, content)
  }
  out.set('README.md', String(snapshot.get('README.md') || '') + detachedReadme(node))

  for (const [path, content] of runner) {
    out.set(BACKEND_DIR + path, content)
  }
  out.set(BACKEND_DIR + 'fixture.json', JSON.stringify(fixture, null, 2) + '\n')
  out.set(BACKEND_DIR + 'package.json', JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    private: true,
    license: 'MIT',
    engines: major ? { node: '>=' + major } : undefined,
    bin: { 'conf-agenda': 'bin/conf-agenda.mjs' },
    scripts: { local: 'node dist/env/local/local.js' },
    dependencies: deps,
  }, null, 2) + '\n')
  out.set(BACKEND_DIR + 'run.sh', [
    '#!/bin/sh',
    '# The conf-agenda local runner: one in-process instance, in-memory store.',
    'cd "$(dirname "$0")"',
    'exec node dist/env/local/local.js',
    '',
  ].join('\n'))

  return out
}

/** The README section a detached bundle adds: the runtime, what the
 *  organiser supplies, and how editing works. */
export function detachedReadme(node: string): string {
  return [
    '',
    '## Running it yourself (detached mode)',
    '',
    '`backend/` is the conf-agenda backend, compiled, so you can keep editing without us.',
    'It targets Node.js ' + node + ' or later, the version this bundle was ejected with.',
    'It needs no account, no API key and no conf-agenda service.',
    '',
    '**Publish `site/`. Nothing else here is for hosting.** That is why they are separate',
    'directories: `backend/fixture.json` is the editable programme, so it holds the draft and',
    'private sessions the published agenda leaves out. `site/` holds only what is already public.',
    '',
    'You supply:',
    '',
    '- Node.js, and access to the npm registry once, to run `npm install` inside `backend/`.',
    '- Speaker email addresses. They are never exported, so every speaker in',
    '  `backend/fixture.json` has an empty `email`. Add them back if you want to send',
    '  calendar invitations.',
    '- Somewhere to keep `backend/fixture.json`. It is the copy that matters: the runner',
    '  keeps everything in memory and forgets it when it stops.',
    '',
    'To edit, change `backend/fixture.json` and run these from `site/`, so speaker photos',
    'resolve against its `assets/`:',
    '',
    '```',
    'cd site',
    'node ../backend/bin/conf-agenda.mjs validate ../backend/fixture.json',
    'node ../backend/bin/conf-agenda.mjs eject ../backend/fixture.json \\',
    '  --out ../../agenda-new --mode detached',
    '```',
    '',
    'To start the services themselves, run `sh backend/run.sh`. It starts with an empty',
    'store and a REPL on port 50502 (set `REPL=false` to turn it off).',
    '',
  ].join('\n')
}
