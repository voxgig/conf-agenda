/* The last four SPEC 16.1 errors: fixture-cycle, bad-color-contrast,
 * broken-asset and asset-escapes-root.
 *
 * SPEC 18, as everywhere else here: one TRIGGERING fixture and one
 * NON-TRIGGERING NEAR-MISS per rule. The near-miss is the half that stops a
 * rule being over-eager, and an error that fires when it should not blocks a
 * real conference from publishing.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Os from 'node:os'
import Path from 'node:path'

const { cycles } = require('../../dist/lib/validate/cycle.js')
const { colorContrast } = require('../../dist/lib/validate/color_contrast.js')
const { assets } = require('../../dist/lib/validate/assets.js')
const { makeAssetCheck } = require('../../dist/lib/assets.js')
const { contrastRatio, parseHex, AA_NON_TEXT } = require('../../dist/lib/contrast.js')

const T = (h: number) => 1825200000000 + h * 3600000

function input(over: any = {}) {
  return {
    top: {
      id: 'conf', org_id: 'o1', kind: 'con', title: 'Conf', slug: 'c',
      t_start: T(8), t_end: T(18), effective_status: 'confirmed',
    },
    segments: [],
    rooms: [],
    tracks: [],
    speakers: [],
    appearances: [],
    ...over,
  }
}
const seg = (o: any) => ({ parent_id: 'conf', org_id: 'o1', kind: 'tak', ...o })
const rules = (d: any[]) => d.map((x) => x.rule)

// The card surface in each mode - what the strip is actually drawn on.
const SURFACES = { dark: '#1a2029', light: '#ffffff' }


describe('rule: fixture-cycle', () => {
  test('TRIGGERS on a fixture that is its own parent', () => {
    const out = cycles(input({
      segments: [seg({ id: 'loop', title: 'Loop', parent_id: 'loop' })],
    }))
    assert.deepEqual(rules(out), ['fixture-cycle'])
    assert.match(out[0].message, /is its own parent/)
  })

  test('TRIGGERS on a longer ring, and reports it ONCE', () => {
    // A three-node cycle is one problem. Three diagnostics saying so is three
    // times the noise and no more information.
    const out = cycles(input({
      segments: [
        seg({ id: 'a', title: 'A', parent_id: 'c' }),
        seg({ id: 'b', title: 'B', parent_id: 'a' }),
        seg({ id: 'c', title: 'C', parent_id: 'b' }),
      ],
    }))
    assert.equal(out.length, 1, 'reported once per member: ' + JSON.stringify(rules(out)))
    assert.deepEqual(out[0].data.ring.slice().sort(), ['a', 'b', 'c'])
    // Both — all — sides named (SPEC 16.3).
    assert.deepEqual(out[0].related.map((r: any) => r.id).sort(), ['a', 'b', 'c'])
  })

  test('near-miss: a deep but acyclic chain is fine', () => {
    const out = cycles(input({
      segments: [
        seg({ id: 'day', kind: 'day', title: 'Day' }),
        seg({ id: 'talk', title: 'Talk', parent_id: 'day' }),
      ],
    }))
    assert.deepEqual(out, [])
  })

  test('near-miss: a missing parent is not a cycle', () => {
    // unknown-reference is the rule for that, and saying it twice in two
    // rules is two problems where there is one.
    const out = cycles(input({
      segments: [seg({ id: 'orphan', title: 'Orphan', parent_id: 'gone' })],
    }))
    assert.deepEqual(out, [])
  })
})


describe('rule: bad-color-contrast', () => {
  test('TRIGGERS on a colour that fails in ONE mode', () => {
    // Passing one ground is not passing: the app ships both, and vox-teal on
    // white is 2.1:1.
    const out = colorContrast(
      input({ tracks: [{ id: 't1', org_id: 'o1', name: 'Frontend', color: '#00c6d8' }] }),
      SURFACES,
    )
    assert.deepEqual(rules(out), ['bad-color-contrast'])
    assert.match(out[0].message, /light/)
    assert.equal(out[0].data.failed.length, 1)
  })

  test('TRIGGERS on a colour that is not a colour', () => {
    const out = colorContrast(
      input({ tracks: [{ id: 't1', org_id: 'o1', name: 'Bad', color: 'chartreuse-ish' }] }),
      SURFACES,
    )
    assert.deepEqual(rules(out), ['bad-color-contrast'])
    assert.match(out[0].message, /cannot be read/)
  })

  test('near-miss: a mid-tone passes BOTH modes', () => {
    const out = colorContrast(
      input({ tracks: [{ id: 't1', org_id: 'o1', name: 'Platform', color: '#2f7fd4' }] }),
      SURFACES,
    )
    assert.deepEqual(out, [])
  })

  test('near-miss: a track with no colour is not a failure', () => {
    const out = colorContrast(
      input({ tracks: [{ id: 't1', org_id: 'o1', name: 'Plain' }] }),
      SURFACES,
    )
    assert.deepEqual(out, [])
  })

  test('the threshold is the NON-TEXT one, and it is not decoration', () => {
    // The raw colour is a 3px strip and a 14% chip wash - never a glyph. If
    // this ever becomes 4.5 it fails the project's own brand palette on data
    // that renders perfectly well, which is how a rule teaches people to
    // ignore it.
    assert.equal(AA_NON_TEXT, 3)
    // vox-red on the dark card surface: passes at 3, fails at 4.5.
    const r = contrastRatio('#e70042', SURFACES.dark)
    assert.ok(r >= 3 && r < 4.5, 'the fixture for this test has moved: ' + r)
  })

  test('parseHex takes #rgb and #rrggbb, and refuses the rest', () => {
    assert.deepEqual(parseHex('#fff'), [255, 255, 255])
    assert.deepEqual(parseHex('00c6d8'), [0, 198, 216])
    assert.equal(parseHex('rgb(0,0,0)'), null)
    assert.equal(parseHex(''), null)
    assert.equal(parseHex(null), null)
  })
})


describe('rules: broken-asset and asset-escapes-root', () => {
  // A real directory, because the whole point of these two is what the
  // FILESYSTEM says - and one of them is specifically about symlinks, which
  // cannot be faked with a stub.
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'cag-assets-'))
  Fs.writeFileSync(Path.join(root, 'ada.jpg'), 'x')
  Fs.mkdirSync(Path.join(root, 'sub'))
  Fs.writeFileSync(Path.join(root, 'sub', 'deep.jpg'), 'x')

  const outside = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'cag-outside-'))
  Fs.writeFileSync(Path.join(outside, 'secrets.txt'), 'x')
  // A symlink INSIDE the root pointing outside it. This is the case lexical
  // normalisation gets wrong: it normalises to an inside path and resolves to
  // an outside file.
  let symlinked = true
  try {
    Fs.symlinkSync(Path.join(outside, 'secrets.txt'), Path.join(root, 'sneaky.jpg'))
  } catch (e) {
    symlinked = false
  }

  const check = makeAssetCheck(root)
  const speaker = (photo: any) => input({
    speakers: [{ id: 'sp1', org_id: 'o1', name: 'Ada', email: '', photo }],
  })

  test('near-miss: a file that is there and inside the root is fine', () => {
    assert.deepEqual(assets(speaker('ada.jpg'), check), [])
    assert.deepEqual(assets(speaker('sub/deep.jpg'), check), [])
  })

  test('TRIGGERS broken-asset on a path inside the root that is not there', () => {
    const out = assets(speaker('missing.jpg'), check)
    assert.deepEqual(rules(out), ['broken-asset'])
    assert.match(out[0].message, /does not resolve/)
  })

  test('TRIGGERS asset-escapes-root on a climbing path', () => {
    // An escape whether or not it exists - existence is not containment.
    const out = assets(speaker('../../etc/passwd'), check)
    assert.deepEqual(rules(out), ['asset-escapes-root'])
  })

  test('TRIGGERS asset-escapes-root through a SYMLINK inside the root', () => {
    if (!symlinked) return
    const out = assets(speaker('sneaky.jpg'), check)
    assert.deepEqual(rules(out), ['asset-escapes-root'],
      'a symlink out of the root was judged contained — lexical normalisation ' +
      'says it is inside, and only realpath says otherwise')
    // It EXISTS, which is exactly why reporting it as merely missing would
    // be the wrong story.
    assert.equal(out[0].data.exists, true)
  })

  test('near-miss: a remote URL is neither broken nor an escape', () => {
    // Somebody else's to serve. Reporting it would make the rule noise on
    // every conference that hosts its photos elsewhere.
    assert.deepEqual(assets(speaker('https://example.invalid/ada.jpg'), check), [])
    assert.deepEqual(assets(speaker('data:image/png;base64,iVBOR'), check), [])
  })

  test('near-miss: no photo at all is not a broken one', () => {
    assert.deepEqual(assets(speaker(''), check), [])
    assert.deepEqual(assets(speaker(null), check), [])
  })

  test('a rule with no checker returns nothing, and the caller always supplies one', () => {
    // Stated rather than assumed: this is the silent-skip shape, and the
    // service test is what proves the checker is actually wired in.
    assert.deepEqual(assets(speaker('missing.jpg')), [])
  })
})
