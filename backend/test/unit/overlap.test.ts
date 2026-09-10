import { describe, test } from 'node:test'
import assert from 'node:assert'

// Loaded from the compiled output, as boot.test.ts does - the test project's
// rootDir is test/, so src/ cannot be imported directly.
// Run `npm run build` before `npm test`.
const { overlaps, overlapMs, isProper } = require('../../dist/lib/overlap.js')

type Interval = { start: number; end: number }

// Naive reference: expand each interval to the set of instants it covers at
// unit granularity and intersect. Deliberately stupid, deliberately obvious.
function naiveOverlaps(a: Interval, b: Interval): boolean {
  for (let t = a.start; t < a.end; t++) {
    if (b.start <= t && t < b.end) return true
  }
  return false
}

// Deterministic PRNG - no Math.random reaching a test (SPEC 17, determinism).
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function randomIntervals(n: number, span: number, seed: number): Interval[] {
  const rnd = makeRng(seed)
  const out: Interval[] = []
  for (let i = 0; i < n; i++) {
    const start = Math.floor(rnd() * span)
    const len = Math.floor(rnd() * (span / 4))
    out.push({ start, end: start + len })
  }
  return out
}

describe('overlap', () => {
  test('adjacent intervals do not overlap - the half-open rule', () => {
    // The case SPEC 16.1 calls out by name: 14:00 end, 14:00 start.
    assert.equal(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }), false)
    assert.equal(overlaps({ start: 10, end: 20 }, { start: 0, end: 10 }), false)
  })

  test('intervals sharing one instant do overlap', () => {
    assert.equal(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 }), true)
    assert.equal(overlapMs({ start: 0, end: 11 }, { start: 10, end: 20 }), 1)
  })

  test('containment overlaps, in both directions', () => {
    const outer = { start: 0, end: 100 }
    const inner = { start: 40, end: 60 }
    assert.equal(overlaps(outer, inner), true)
    assert.equal(overlaps(inner, outer), true)
    assert.equal(overlapMs(outer, inner), 20)
  })

  test('a proper interval overlaps itself; a degenerate one overlaps nothing', () => {
    const proper = { start: 5, end: 9 }
    assert.equal(isProper(proper), true)
    assert.equal(overlaps(proper, proper), true)

    // Zero-length: covers no instants, so half-open gives no overlap at all -
    // not even with itself. The model forbids these (t_end > t_start), but the
    // helper must not blow up on one that reaches it from an import or the API.
    const degenerate = { start: 5, end: 5 }
    assert.equal(isProper(degenerate), false)
    assert.equal(overlaps(degenerate, degenerate), false)
    assert.equal(overlaps(degenerate, proper), false)
    assert.equal(overlaps(proper, degenerate), false)

    // The case the naive reference caught: degenerate strictly INSIDE proper.
    const inside = { start: 7, end: 7 }
    assert.equal(overlaps({ start: 5, end: 9 }, inside), false)
    assert.equal(overlaps(inside, { start: 5, end: 9 }), false)
  })

  test('property: symmetric, over 400 random pairs', () => {
    const xs = randomIntervals(400, 200, 12345)
    const ys = randomIntervals(400, 200, 67890)
    for (let i = 0; i < xs.length; i++) {
      assert.equal(
        overlaps(xs[i], ys[i]),
        overlaps(ys[i], xs[i]),
        `not symmetric at ${i}: ${JSON.stringify(xs[i])} ${JSON.stringify(ys[i])}`,
      )
    }
  })

  test('property: agrees with the naive reference, over 400 random pairs', () => {
    const xs = randomIntervals(400, 200, 24680)
    const ys = randomIntervals(400, 200, 13579)
    let overlapping = 0
    for (let i = 0; i < xs.length; i++) {
      const got = overlaps(xs[i], ys[i])
      assert.equal(
        got,
        naiveOverlaps(xs[i], ys[i]),
        `disagrees at ${i}: ${JSON.stringify(xs[i])} ${JSON.stringify(ys[i])}`,
      )
      if (got) overlapping++
    }
    // Guard against a vacuous pass: the sample must contain both outcomes.
    assert.ok(overlapping > 0, 'no overlapping pairs in sample - test proves nothing')
    assert.ok(overlapping < xs.length, 'all pairs overlapped - test proves nothing')
  })
})
