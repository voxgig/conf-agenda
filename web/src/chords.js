// `g` THEN A LETTER: go to a view (PLATFORM §5.2, SPEC §13.1).
//
// The shared vocabulary puts navigation behind a chord rather than a bare key,
// and the reason is that there are only so many letters. `g a` / `g s` costs
// two keystrokes and no single-letter budget, which is why both apps use it.
//
// IT LIVES ABOVE THE GRID, not inside it. The grid's binding registry owns the
// keys that act on a session, and the grid is not mounted when you are looking
// at the speaker list: `g a` has to work from there, which is the whole point
// of having it. So the reader is here, the shell drives it from a document
// listener, and the grid's registry carries display-only entries so the `?`
// overlay and the command bar still list them.
//
// The reader is pure and the clock is injected, so the timeout is testable
// without waiting for it.

/** How long a prefix stays armed. Long enough to be deliberate, short enough
 *  that a `g` you typed by accident does not eat the next keystroke. */
export const CHORD_TIMEOUT = 1500

/**
 * A chord reader over `{ 'g a': 'cag/fixture', ... }`.
 *
 * `press(key)` returns the mapped target when a chord completes, and null
 * otherwise. It also reports whether the key was SWALLOWED as a prefix, so the
 * caller can preventDefault on `g` itself: without that, arming the chord in a
 * view that binds `g` to something else would do both.
 */
export function makeChords(map, options = {}) {
  const timeout = null == options.timeout ? CHORD_TIMEOUT : options.timeout
  const now = options.now || (() => Date.now())

  // The first letter of every mapping, so the prefixes come from the map
  // rather than a second list that can disagree with it.
  const prefixes = new Set(Object.keys(map)
    .map((k) => k.split(' ')[0])
    .filter((k) => 1 === k.length))

  let pending = null
  let armedAt = 0

  return {
    get pending() { return pending },

    reset() { pending = null },

    press(key, when) {
      const at = null == when ? now() : when

      // A completed chord, if the prefix is still live. An EXPIRED prefix is
      // not a failed chord: the key that follows it should be read on its own
      // terms, which is why this falls through rather than returning null.
      if (null != pending && at - armedAt <= timeout) {
        const target = map[pending + ' ' + key]
        pending = null
        if (null != target) return { target, swallowed: true }
        // A prefix followed by a letter that means nothing is still consumed.
        // `g` then `q` should do nothing at all, not `q`.
        return { target: null, swallowed: true }
      }

      if (prefixes.has(key)) {
        pending = key
        armedAt = at
        return { target: null, swallowed: true }
      }

      pending = null
      return { target: null, swallowed: false }
    },
  }
}

/**
 * The chords this app defines, and only the ones whose views exist.
 *
 * SPEC §13.1 names four: `g a` agenda grid, `g s` speakers, `g p` programme
 * list, `g c` calendar console. The last two have no view to go to yet, so
 * they are absent rather than advertised and dead: a hint for a binding that
 * does nothing is worse than no hint, which is the rule the footer already
 * follows.
 */
export const NAV_CHORDS = {
  'g a': 'cag/fixture',
  'g s': 'cag/speaker',
}

/** Fields own their own keystrokes. Same guard the grid's handler uses. */
export function inField(target) {
  return null != target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')
}
