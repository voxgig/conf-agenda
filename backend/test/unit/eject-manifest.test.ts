import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

// Top-level on purpose: `npm test` globs dist-test/unit/*.test.js one level
// only, so a test under unit/lib/ would never run in the gate.

const { buildManifest, MODES } = require('../../dist/lib/eject/manifest.js')
const { GUARANTEES, DORMANT_DEFAULT } = require('../../dist/lib/eject/readme.js')
// The one definition of a runtime reference, shared with web/e2e/eject-offline.
const { runtimeRefs } = require('../../dist/lib/eject/index_html.js')

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

// A conference carrying its own website, which is the ordinary case: the
// nodeconf fixture has `w_site: 'https://www.nodeconf.eu/'`. Content links are
// not runtime references, and the checks below have to tell them apart.
const AGENDA_WITH_SITE = JSON.stringify({
  ...JSON.parse(AGENDA),
  conference: { ...JSON.parse(AGENDA).conference, w_site: 'https://www.nodeconf.eu/' },
})


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

  test('eject-manifest: the README names the component\'s dormant hosted-path default', () => {
    const readme = String(build().get('README.md'))
    const section = readme.split('## What it does not do')[1]
    assert.ok(section, 'the section exists')
    assert.ok(section.includes(DORMANT_DEFAULT), 'the sentence is in that section')
    // The URL it names is the one the component really carries.
    const component = Fs.readFileSync(Path.join(process.cwd(), 'asset/conf-agenda.js'), 'utf8')
    const url = DORMANT_DEFAULT.match(/https:\/\/[^`]+/)[0]
    assert.ok(component.includes(url), 'the component carries ' + url)
    assert.match(DORMANT_DEFAULT, /never does/)
  })

  test('eject-manifest: index.html loads a classic script and resolves nothing absolute', () => {
    const html = String(build().get('index.html'))
    // Known-present first, so the absence checks below cannot pass vacuously.
    assert.match(html, /<script src="conf-agenda\.js"><\/script>/)
    assert.ok(!html.includes('type="module"'), 'a module script cannot load from file://')

    // A RUNTIME reference is one the page resolves while rendering, and every
    // one of those must be relative or the file:// promise is void. The blanket
    // "no https:// anywhere in the file" check this replaces was wrong AND
    // vacuous: the agenda is inlined into this page, so a conference carrying
    // its own website broke it, and `tiny` only passed by having none.
    const refs = runtimeRefs(html)
    assert.deepEqual(refs, ['conf-agenda.js'], 'the only runtime reference')
  })

  test('eject-manifest: a conference website is content, not a runtime reference', () => {
    const html = String(buildManifest({
      agenda: AGENDA_WITH_SITE, mode: 'snapshot', component: '/* component */',
    }).get('index.html'))

    // Known-present: the site survives into the page, because stripping the
    // programme's own links would misrepresent the conference.
    assert.ok(html.includes('https://www.nodeconf.eu/'), 'the site is carried')
    // And it is still not something the page loads.
    assert.deepEqual(runtimeRefs(html), ['conf-agenda.js'])
  })

  test('eject-manifest: the inlined agenda cannot close its script tag', () => {
    const html = String(build().get('index.html'))
    const m = html.match(/<script id="agenda-data" type="application\/json">([\s\S]*?)<\/script>/)
    assert.ok(m, 'the inline data block is present')
    assert.equal(JSON.stringify(JSON.parse(m[1])), AGENDA, 'and parses back to the snapshot')
    assert.match(html, /<title>Tiny Conf &lt;\/script&gt; 2027<\/title>/)
  })
})
