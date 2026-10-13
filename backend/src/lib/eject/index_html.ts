/* The ejected bundle's index.html. SPEC 12: "open index.html from a file://
 * URL and it works".
 *
 * Two things a file:// page cannot do shape this file:
 *
 * - load a MODULE script. Module scripts are fetched under CORS and a file://
 *   origin is opaque, so `type="module"` fails with no network involved. The
 *   component is loaded with a plain <script>, which is why the bundle ships
 *   the embed's UMD build.
 * - fetch(). So the agenda is inlined into a JSON script block and handed to
 *   the element as a property, rather than named by a `src` it would fetch.
 *
 * Every reference is relative: the page works from any directory.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** JSON safe inside a <script> block: nothing in it can close the tag. */
function inlineJson(json: string): string {
  return json.replace(/</g, '\\u003c')
}

export function buildIndexHtml(input: { title: string; agenda_json: string }): string {
  const title = escapeHtml(input.title)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + title + '</title>',
    '<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif}</style>',
    '</head>',
    '<body>',
    '<h1>' + title + '</h1>',
    '<conf-agenda id="agenda"></conf-agenda>',
    '<script id="agenda-data" type="application/json">' + inlineJson(input.agenda_json) + '</script>',
    '<script src="conf-agenda.js"></script>',
    '<script>',
    "document.getElementById('agenda').agenda =",
    "  JSON.parse(document.getElementById('agenda-data').textContent)",
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
