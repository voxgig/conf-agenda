import { describe, test } from 'node:test'
import assert from 'node:assert'

// Top-level on purpose: `npm test` globs dist-test/unit/*.test.js one level
// only, so a test under unit/lib/ would never run in the gate.

const { buildManifest, MODES } = require('../../dist/lib/eject/manifest.js')
const { GUARANTEES } = require('../../dist/lib/eject/readme.js')

/** The eight entries SPEC 12 names for a snapshot bundle. */
const SECTION_12 = [
  'LICENSE', 'README.md', 'agenda.csv', 'agenda.ics', 'agenda.json',
  'assets/', 'conf-agenda.js', 'index.html',
]

const AGENDA = JSON.stringify({
  schemaVersion: 1,
  conference: {
    slug: 'tiny-conf-2027', title: 'Tiny Conf </script> 2027', t_tzn: 'Europe/Dublin',
    t_start: 1825230600000, t_end: 1825261200000,
  },
  rooms: [{ id: 'r1', name: 'Room A' }],
  tracks: [],
  speakers: [{ id: 'sp1', name: 'Ada Byrne' }],
  sessions: [
    {
      id: 'keynote', title: 'Opening Keynote', kind: 'key', room: 'r1',
      t_start: 1825232400000, t_end: 1825236000000, status: 'confirmed', speakers: ['sp1'],
    },
  ],
})

const build = (mode = 'snapshot') =>
  buildManifest({ agenda: AGENDA, mode, component: '/* component */' })

describe('eject-manifest', () => {
  test('eject-manifest: a snapshot has exactly the eight SPEC 12 entries', () => {
    assert.deepEqual([...build().keys()].sort(), SECTION_12)
  })

  test('eject-manifest: agenda.json is the given snapshot, byte for byte', () => {
    assert.equal(build().get('agenda.json'), AGENDA)
  })

  test('eject-manifest: an unknown mode throws, naming it and the valid ones', () => {
    assert.deepEqual(MODES, ['snapshot', 'detached'])
    assert.throws(() => build('zip'), (err: any) => {
      assert.match(err.message, /"zip"/)
      for (const m of MODES) assert.match(err.message, new RegExp(m))
      return true
    })
  })

  test('eject-manifest: an asset outside assets/ is refused', () => {
    assert.throws(
      () => buildManifest({
        agenda: AGENDA, mode: 'snapshot', component: '',
        assets: new Map([['index.html', 'overwritten']]),
      }),
      /outside assets\/: index\.html/,
    )
  })

  test('eject-manifest: the README states each guarantee verbatim', () => {
    const readme = String(build().get('README.md'))
    assert.equal(GUARANTEES.length, 3)
    assert.match(GUARANTEES[0], /no runtime dependency on any conf-agenda service/)
    assert.match(GUARANTEES[1], /no tracking of any kind/)
    assert.match(GUARANTEES[2], /MIT/)
    for (const g of GUARANTEES) assert.ok(readme.includes(g), 'missing: ' + g)
    for (const h of ['## How to host it', '## How to refresh it', '## What it does not do']) {
      assert.ok(readme.includes(h), 'missing section: ' + h)
    }
    assert.match(String(build().get('LICENSE')), /^MIT License/)
  })

  test('eject-manifest: index.html loads a classic script and references nothing absolute', () => {
    const html = String(build().get('index.html'))
    // Known-present first, so the absence checks below cannot pass vacuously.
    assert.match(html, /<script src="conf-agenda\.js"><\/script>/)
    assert.ok(!html.includes('type="module"'), 'a module script cannot load from file://')
    assert.ok(!/https?:\/\//.test(html), 'no absolute reference')
  })

  test('eject-manifest: the inlined agenda cannot close its script tag', () => {
    const html = String(build().get('index.html'))
    const m = html.match(/<script id="agenda-data" type="application\/json">([\s\S]*?)<\/script>/)
    assert.ok(m, 'the inline data block is present')
    assert.equal(JSON.stringify(JSON.parse(m[1])), AGENDA, 'and parses back to the snapshot')
    assert.match(html, /<title>Tiny Conf &lt;\/script&gt; 2027<\/title>/)
  })
})
