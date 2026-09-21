/* WCAG contrast, as arithmetic. SPEC 16.1 `bad-color-contrast`.
 *
 * A track colour is ORGANISER DATA, not theme (model/ent.aon says so), which
 * is the whole reason this rule exists: the theme's own palette was checked
 * once by whoever wrote it, and a colour an organiser types into a form was
 * not checked by anybody. It lands as the card's top strip and as the track
 * chip's TEXT, on the card surface, in both theme modes.
 *
 * Pure, and deliberately dependency-free: a contrast library is a lot of
 * surface area for two formulas that have not changed since 2008.
 */

/** #rgb, #rrggbb, or null when it is not a colour this can reason about. */
export function parseHex(value: unknown): [number, number, number] | null {
  if ('string' !== typeof value) return null
  const hex = value.trim().replace(/^#/, '')

  const full = 3 === hex.length
    ? hex.split('').map((c) => c + c).join('')
    : hex
  if (6 !== full.length || !/^[0-9a-f]{6}$/i.test(full)) return null

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** WCAG 2.x relative luminance. */
export function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. Order of the arguments does not matter. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (null == ca || null == cb) return null

  const la = luminance(ca)
  const lb = luminance(cb)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * AA for NON-TEXT contrast (WCAG 1.4.11), and that is the criterion that
 * applies here - checked against how the app actually draws the colour rather
 * than assumed.
 *
 * A track colour is never rendered as text. It is `.ca-seg-strip`'s
 * background - a 3px rule that identifies the track - and `.ca-seg-chip`'s
 * background at 14%, whose TEXT is `color-mix(track 62%, var(--vg-text))`,
 * mixed toward the body colour precisely so it reads on either ground. So the
 * thing needing contrast is a graphical object, not a glyph.
 *
 * Using 4.5 (text) instead would fail the project's own brand palette on data
 * that renders perfectly well, which is how a validation rule teaches people
 * to ignore it.
 */
export const AA_NON_TEXT = 3

/** Kept for callers that genuinely check text. */
export const AA_TEXT = 4.5

/** Rounded to one decimal, so a diagnostic reads "2.4:1" rather than 2.41938. */
export const round1 = (n: number) => Math.round(n * 10) / 10
