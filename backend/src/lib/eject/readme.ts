/* The ejected bundle's README.md. SPEC 12.
 *
 * The three guarantees are exported as constants so the test asserts the
 * exact sentences rather than a paraphrase of them: SPEC 12 says the
 * guarantee lives IN the README, so the README is where it is checked.
 */

export const GUARANTEES = [
  'This bundle has no runtime dependency on any conf-agenda service.',
  'This bundle contains no tracking of any kind: no analytics, no telemetry, no phone-home.',
  'This bundle is MIT licensed; see LICENSE.',
]

export function buildReadme(input: { title: string; slug: string }): string {
  const { title, slug } = input
  return [
    '# ' + title,
    '',
    'The published agenda for ' + title + ' (`' + slug + '`), ejected from conf-agenda.',
    '',
    '## The guarantee',
    '',
    ...GUARANTEES.map((g) => '- ' + g),
    '',
    '## What is here',
    '',
    '| File | What it is |',
    '|---|---|',
    '| `index.html` | a working page showing the agenda; open it directly, no server needed |',
    '| `conf-agenda.js` | the `<conf-agenda>` component, self-contained, CSS inlined |',
    '| `agenda.json` | the published agenda, frozen at the moment it was ejected |',
    '| `agenda.ics` | the same agenda as a calendar file |',
    '| `agenda.csv` | the same agenda as a flat table |',
    '| `assets/` | images the agenda refers to, copied here so nothing is fetched |',
    '| `LICENSE` | MIT |',
    '',
    '## How to host it',
    '',
    'Open `index.html` from your disk and it works. To put it online, copy the whole',
    'directory to any static host (a web server, object storage, GitHub Pages) as it is.',
    'Every path inside it is relative, so it works from any directory and any domain.',
    '',
    'To place the agenda on a page of your own, load `conf-agenda.js` with a plain',
    '`<script>` tag and add `<conf-agenda src="agenda.json"></conf-agenda>` when the page',
    'is served over http, or copy the inline data block from `index.html` when it is not.',
    '',
    '## How to refresh it',
    '',
    'This bundle is a snapshot. It does not update itself. To refresh it, eject again',
    'from wherever the programme is now kept and replace this directory with the result:',
    '',
    '```',
    'conf-agenda eject <fixture.json> --out ./agenda',
    '```',
    '',
    '## What it does not do',
    '',
    '- It does not change. Edits made after ejection are not in it.',
    '- It does not contact anything. No request leaves the page, so there is no live',
    '  "happening now" data from a server and no usage statistics.',
    '- It does not contain speaker contact details. Email addresses are never published.',
    '- It does not edit. Editing needs a running backend (`--mode detached`).',
    '',
  ].join('\n')
}

/** The MIT licence text, which is what SPEC 12 promises the bundle carries. */
export function buildLicense(): string {
  return [
    'MIT License',
    '',
    'Copyright (c) conf-agenda contributors',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy',
    'of this software and associated documentation files (the "Software"), to deal',
    'in the Software without restriction, including without limitation the rights',
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
    'copies of the Software, and to permit persons to whom the Software is',
    'furnished to do so, subject to the following conditions:',
    '',
    'The above copyright notice and this permission notice shall be included in all',
    'copies or substantial portions of the Software.',
    '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
    'SOFTWARE.',
    '',
  ].join('\n')
}
