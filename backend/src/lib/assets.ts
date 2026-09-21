/* Asset resolution. SPEC 16.1 `broken-asset` and `asset-escapes-root`.
 *
 * THE RULES STAY PURE. src/lib/validate/* are pure functions of
 * ValidateInput - no store, no bus, and no filesystem either. So the IO
 * happens HERE, once, and the rules are handed facts: does this path exist,
 * and is it inside the assets root. That keeps every rule testable with a
 * literal and keeps the one place that touches the disk small enough to read.
 *
 * EXISTENCE IS NOT CONTAINMENT, and the spec says to check both. They fail
 * independently: `../../secrets.txt` may well exist, and a path inside the
 * root may well be missing.
 *
 * CONTAINMENT IS CHECKED ON THE CANONICAL PATH, AFTER RESOLVING SYMLINKS.
 * Lexical normalisation alone is not enough - a symlink sitting inside the
 * assets root and pointing outside it normalises to an inside path and
 * resolves to an outside file. A build running in CI would then copy it into
 * public output or into an ejected bundle, which is how a private file
 * becomes a published one.
 */
import Fs from 'node:fs'
import Path from 'node:path'

export type AssetFact = {
  /** A path this checker is willing to reason about at all. */
  local: boolean
  exists: boolean
  contained: boolean
}

/** Anything with a scheme is somebody else's to serve, and not ours to check. */
const REMOTE = /^[a-z][a-z0-9+.-]*:\/\//i

/** A data: URI carries its own bytes - there is nothing to resolve. */
const INLINE = /^data:/i

export type AssetCheck = (path: unknown) => AssetFact

/**
 * A checker bound to one assets root.
 *
 * Returns `local: false` for a URL or a data URI. Those are not broken and
 * not escapes - they are simply not files, and reporting them as missing
 * would make the rule noise on every conference that hosts its photos
 * somewhere else.
 */
export function makeAssetCheck(root: string): AssetCheck {
  // The root's OWN canonical path, resolved once. If the root itself is a
  // symlink, every comparison below has to be against where it really is.
  let realRoot: string
  try {
    realRoot = Fs.realpathSync(Path.resolve(root))
  } catch (e) {
    realRoot = Path.resolve(root)
  }

  return function check(value: unknown): AssetFact {
    if ('string' !== typeof value || '' === value.trim()) {
      return { local: false, exists: false, contained: true }
    }
    const raw = value.trim()
    if (REMOTE.test(raw) || INLINE.test(raw)) {
      return { local: false, exists: false, contained: true }
    }

    // Lexical first, so a path that does not exist can still be judged an
    // escape - `../../secrets.txt` is an escape whether or not it is there.
    const lexical = Path.resolve(realRoot, raw)
    const insideLexically = isInside(realRoot, lexical)

    let exists = false
    let canonical = lexical
    try {
      canonical = Fs.realpathSync(lexical)
      exists = true
    } catch (e) {
      exists = false
    }

    // A missing file cannot be symlinked anywhere, so the lexical verdict is
    // the only one available; an existing one is judged on where it REALLY is.
    const contained = exists ? isInside(realRoot, canonical) : insideLexically

    return { local: true, exists, contained }
  }
}

/** Inside, by path segment - not by string prefix. */
function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true
  const rel = Path.relative(root, candidate)
  // `..` anywhere at the head means it climbed out; an absolute result means
  // it was never under the root at all (a different drive, or a root path).
  return '' !== rel && !rel.startsWith('..' + Path.sep) && '..' !== rel &&
    !Path.isAbsolute(rel)
}
