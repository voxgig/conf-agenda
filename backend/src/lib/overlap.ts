/* Half-open interval overlap. SPEC 16.1.
 *
 * Intervals are [start, end) - start inclusive, end exclusive. So a segment
 * ending at 14:00 and one starting at 14:00 do NOT overlap.
 *
 * This is the single shared helper. Every rule that compares two intervals
 * calls it; nothing reimplements the comparison. Get it wrong and the product
 * emails every speaker about a clash that is not there.
 *
 * Comparisons are always on stored instants (UTC epoch ms), never on
 * wall-time strings (SPEC 8.3).
 */

export type Interval = {
  start: number
  end: number
}

/** True when the interval covers at least one instant: end strictly after start. */
export function isProper(a: Interval): boolean {
  return a.start < a.end
}

/**
 * True when two half-open intervals share at least one instant.
 *
 * A degenerate interval (start === end) covers no instants, so it overlaps
 * nothing - not even itself. A proper interval does overlap itself.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  // A degenerate interval covers no instants, so it overlaps nothing. The
  // bare `a.start < b.end && b.start < a.end` form gets this wrong when the
  // degenerate one sits strictly INSIDE the other (found by the property
  // test against the naive reference). The model forbids these via
  // `t_end > t_start`, but import and API data reaches here before that runs.
  if (!isProper(a) || !isProper(b)) return false
  return a.start < b.end && b.start < a.end
}

/** Milliseconds two intervals share; 0 when they do not overlap. */
export function overlapMs(a: Interval, b: Interval): number {
  const lo = a.start > b.start ? a.start : b.start
  const hi = a.end < b.end ? a.end : b.end
  return hi > lo ? hi - lo : 0
}
