/* The `g` chord reader (PLATFORM §5.2, SPEC §13.1).
 *
 * Pure, with an injected clock, so the timeout is testable without waiting for
 * it. Everything else about chords is a document listener in shell.js and is
 * covered by e2e.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { makeChords, NAV_CHORDS, inField, CHORD_TIMEOUT } from '../src/chords.js'

const MAP = { 'g a': 'grid', 'g s': 'speakers' }

describe('makeChords', () => {
  test('a prefix then a letter resolves', () => {
    const c = makeChords(MAP)
    assert.deepEqual(c.press('g'), { target: null, swallowed: true })
    assert.deepEqual(c.press('a'), { target: 'grid', swallowed: true })
  })

  test('the prefix is consumed, so `g` alone does nothing else', () => {
    // Without this, arming the chord in a view that binds `g` would do both.
    const c = makeChords(MAP)
    assert.equal(c.press('g').swallowed, true)
    assert.equal(c.pending, 'g')
  })

  test('a prefix then an unmapped letter is consumed, not passed through', () => {
    // `g` then `q` should do nothing at all, not `q`. Otherwise a mistyped
    // chord fires whatever the second letter happens to be bound to, which on
    // this grid includes `d` (duplicate) and `t` (cycle status).
    const c = makeChords(MAP)
    c.press('g')
    assert.deepEqual(c.press('q'), { target: null, swallowed: true })
    assert.equal(c.pending, null)
  })

  test('an ordinary key is not swallowed', () => {
    const c = makeChords(MAP)
    assert.deepEqual(c.press('j'), { target: null, swallowed: false })
  })

  test('an EXPIRED prefix reads the next key on its own terms', () => {
    // A stale `g` is not a failed chord. If it swallowed the next keystroke,
    // a `g` typed by accident a minute ago would eat the next real one.
    const c = makeChords(MAP, { timeout: 100 })
    c.press('g', 0)
    assert.deepEqual(c.press('a', 5000), { target: null, swallowed: false })
  })

  test('the prefix re-arms rather than sticking', () => {
    const c = makeChords(MAP)
    c.press('g')
    c.press('a')
    assert.equal(c.pending, null)
    c.press('g')
    assert.deepEqual(c.press('s'), { target: 'speakers', swallowed: true })
  })

  test('prefixes come from the map, not a second list', () => {
    // A map with no `g` has no `g` prefix, so nothing is swallowed by accident.
    const c = makeChords({ 'x y': 'thing' })
    assert.deepEqual(c.press('g'), { target: null, swallowed: false })
    assert.deepEqual(c.press('x'), { target: null, swallowed: true })
    assert.deepEqual(c.press('y'), { target: 'thing', swallowed: true })
  })

  test('reset drops a pending prefix', () => {
    const c = makeChords(MAP)
    c.press('g')
    c.reset()
    assert.equal(c.pending, null)
    assert.deepEqual(c.press('a'), { target: null, swallowed: false })
  })

  test('the timeout is a real number of milliseconds', () => {
    assert.ok(500 < CHORD_TIMEOUT && CHORD_TIMEOUT < 5000)
  })
})

describe('NAV_CHORDS', () => {
  test('only chords whose views exist', () => {
    // SPEC §13.1 names four; `g p` (programme list) and `g c` (calendar
    // console) have nothing to go to yet. A hint for a binding that does
    // nothing is worse than no hint.
    assert.deepEqual(Object.keys(NAV_CHORDS).sort(), ['g a', 'g s'])
    assert.equal(NAV_CHORDS['g a'], 'cag/fixture')
  })
})

describe('inField', () => {
  test('fields own their own keystrokes', () => {
    assert.equal(inField({ tagName: 'INPUT' }), true)
    assert.equal(inField({ tagName: 'TEXTAREA' }), true)
    assert.equal(inField({ tagName: 'SELECT' }), true)
    assert.equal(inField({ tagName: 'DIV' }), false)
    assert.equal(inField(null), false)
  })
})
