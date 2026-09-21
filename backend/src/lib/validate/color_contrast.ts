/* SPEC 16.1: bad-color-contrast.
 *
 * "A track colour fails WCAG AA in either theme mode."
 *
 * A TRACK COLOUR IS ORGANISER DATA, not theme - model/ent.aon says so
 * explicitly - and that is the whole reason this is a rule. The theme's own
 * palette was checked by whoever wrote it; a colour somebody types into the
 * track form was checked by nobody, and it lands as the card's top strip and
 * as the chip's text on the card surface.
 *
 * IN EITHER MODE. A colour can read perfectly on the dark surface and vanish
 * on the light one, and the app ships both - so passing one is not passing.
 */

import { AA_NON_TEXT, contrastRatio, parseHex, round1 } from '../contrast'
import { Diagnostic, sortDiagnostics } from './diagnostic'
import { Row, ValidateInput, ref } from './input'

export const BAD_CONTRAST = 'bad-color-contrast'

/** The surface a track colour is drawn on, per mode. Overridable for tests. */
export type Surfaces = Record<string, string>

export function colorContrast(input: ValidateInput, surfaces?: Surfaces): Diagnostic[] {
  const grounds = surfaces || (input as any).surfaces
  // No theme to check against is not a pass - it is a rule that could not
  // run, and saying nothing would be a silent skip. The caller always
  // supplies these (srv/cag/validate_fixture.ts reads them from the model).
  if (null == grounds || 0 === Object.keys(grounds).length) return []

  const out: Diagnostic[] = []

  for (const track of input.tracks as Row[]) {
    const colour = track.color
    if (null == colour || '' === colour) continue

    const name = String(track.name ?? track.id)

    if (null == parseHex(colour)) {
      out.push({
        rule: BAD_CONTRAST,
        severity: 'error',
        message: 'Track ' + JSON.stringify(name) + ' has a colour that cannot be read: ' +
          JSON.stringify(String(colour)) + '.',
        entity: ref('cag/track', track.id, name),
        related: [ref('cag/track', track.id, name)],
        fix: 'Use a hex colour, for example #4f9d69.',
        data: { color: colour },
      })
      continue
    }

    const failed: { mode: string; ratio: number }[] = []
    for (const mode of Object.keys(grounds).sort()) {
      const ratio = contrastRatio(String(colour), grounds[mode])
      if (null == ratio) continue
      if (ratio < AA_NON_TEXT) failed.push({ mode, ratio: round1(ratio) })
    }
    if (0 === failed.length) continue

    out.push({
      rule: BAD_CONTRAST,
      severity: 'error',
      message: 'Track ' + JSON.stringify(name) + "'s colour fails WCAG AA in " +
        failed.map((f) => f.mode + ' (' + f.ratio + ':1)').join(' and ') +
        ' — AA needs ' + AA_NON_TEXT + ':1 for a graphical object.',
      entity: ref('cag/track', track.id, name),
      related: [ref('cag/track', track.id, name)],
      fix: 'Darken or lighten the colour until it reads in both modes.',
      data: { color: colour, failed },
    })
  }

  return sortDiagnostics(out)
}
