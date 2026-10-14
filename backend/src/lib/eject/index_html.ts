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
 *   The property is set before the component script runs; the component
 *   picks it up when it upgrades the element.
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

/**
 * Every reference a page RESOLVES while rendering: script, image, iframe and
 * source `src`, `<link href>`, and CSS `url()`. An `<a href>` is a content
 * link the reader clicks, not one of these. The bundle's file:// promise is
 * that every one of these is relative; the unit suite and the offline e2e
 * test both judge it with this one definition.
 */
export function runtimeRefs(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<(?:script|img|iframe|source)\b[^>]*\bsrc="([^"]*)"/g)) out.push(m[1])
  for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]*)"/g)) out.push(m[1])
  for (const m of html.matchAll(/url\((['"]?)([^)'"]*)\1\)/g)) out.push(m[2])
  return out
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
    // Handed over BEFORE the component loads, so the element is never seen
    // without data: set after, it would first report a missing source.
    '<script>',
    "document.getElementById('agenda').agenda =",
    "  JSON.parse(document.getElementById('agenda-data').textContent)",
    '</script>',
    '<script src="conf-agenda.js"></script>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
