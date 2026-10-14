// SPEC 12 calls this test the promise itself: an ejected bundle, opened from a
// file:// URL with every outbound request blocked, still shows the agenda. If
// this spec is deleted, the promise is gone.
//
// It ejects through the real CLI into its own temp directory and touches no
// seeded row, so its place in the serial suite does not matter.
//
// Self-containedness is asserted three ways, because a blanket "no http(s)://
// anywhere in the bundle" is wrong: the agenda carries the conference's own
// links as content, and the component carries the hosted address it would use
// for a page that asked it to.
//   (a) behavioural: the route handler aborts ZERO requests. Chromium routes
//       file:// loads too, so a literal abort-everything would block the page
//       itself; the handler lets through only files inside the bundle and
//       aborts, and records, everything else;
//   (b) structural: every runtime reference the markup emits is relative, by
//       the same definition the backend unit suite uses (runtimeRefs);
//   (c) an enumerated allowlist of the absolute strings that may sit in the
//       bundle as inert data, so a NEW absolute reference fails here.
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const BACKEND = resolve(__dirname, '../../backend')
const { runtimeRefs } = require(join(BACKEND, 'dist/lib/eject/index_html.js'))
const { DORMANT_DEFAULT } = require(join(BACKEND, 'dist/lib/eject/readme.js'))

const SITE = 'https://tiny-conf.example.test/'

// The component's dormant hosted-path default. Allowed because the bundle's
// README says why it is there and that it is never requested: see
// DORMANT_DEFAULT in backend/src/lib/eject/readme.ts (task 2.5a).
const DORMANT = DORMANT_DEFAULT.match(/https:\/\/[^`]+/)[0]

/** Eject tiny into a fresh temp directory. Two edits first: its deliberate
 *  room clash is resolved so it can publish (as backend's cli.test does), and
 *  it is given a website so the content-link half of (c) has something to
 *  allow. */
function eject() {
  const work = mkdtempSync(join(tmpdir(), 'cag-eject-offline-'))
  const tiny = JSON.parse(readFileSync(join(BACKEND, 'test/fixtures/tiny/tiny.json'), 'utf8'))
  for (const row of tiny['cag/fixture']) {
    if ('conf_tiny' === row.id) row.w_site = SITE
    if ('seg_d1edge' === row.id) {
      row.t_start = 1825239600000 // 11:00
      row.t_end = 1825243200000 // 12:00
    }
  }
  const fixture = join(work, 'tiny.json')
  writeFileSync(fixture, JSON.stringify(tiny))

  const out = join(work, 'bundle')
  execFileSync('node', [join(BACKEND, 'bin/conf-agenda.mjs'), 'eject', fixture, '--out', out],
    { cwd: BACKEND, stdio: 'pipe' })
  return out
}

/** Let the bundle's own files through; abort and record everything else. */
async function blockAllButBundle(context, bundle) {
  const root = pathToFileURL(bundle).href + '/'
  const blocked = []
  await context.route('**', (r) => {
    const url = r.request().url()
    if (url.startsWith(root)) return r.continue()
    blocked.push(url)
    return r.abort()
  })
  return blocked
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

test.describe('an ejected bundle, offline', () => {
  let bundle

  test.beforeAll(() => {
    bundle = eject()
  })

  test('renders from file:// with all outbound network blocked, and a session opens', async ({ context, page }) => {
    const blocked = await blockAllButBundle(context, bundle)
    const requested = []
    page.on('request', (r) => requested.push(r.url()))
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto(pathToFileURL(join(bundle, 'index.html')).href)

    const agenda = page.locator('conf-agenda')
    await expect(agenda.locator('table')).toBeVisible()
    await expect(agenda.locator('.session .title', { hasText: 'Opening Keynote' })).toBeVisible()
    await expect(agenda.locator('[part=error]')).toHaveCount(0)

    // A session opens: the embed is read-only, so opening one is the select
    // event the host page acts on, carrying that session.
    const selected = page.evaluate(() => new Promise((ok) =>
      document.addEventListener('conf-agenda:select', (e) => ok(e.detail.title), { once: true })))
    await agenda.locator('.session', { hasText: 'Opening Keynote' }).first().click()
    expect(await selected).toBe('Opening Keynote')

    // (a) Nothing outside the bundle was asked for, and the page loaded only
    // its own files. Known-present: it did load something, the page itself.
    expect(blocked).toEqual([])
    expect(requested.length).toBeGreaterThan(0)
    const root = pathToFileURL(bundle).href + '/'
    for (const url of requested) expect(url.startsWith(root), url).toBe(true)
    expect(errors).toEqual([])
  })

  test('every runtime reference the markup emits is relative', async ({ context, page }) => {
    await blockAllButBundle(context, bundle)
    await page.goto(pathToFileURL(join(bundle, 'index.html')).href)
    await expect(page.locator('conf-agenda').locator('table')).toBeVisible()

    // (b) The file as written and the DOM as rendered, shadow root included.
    const rendered = await page.evaluate(() =>
      document.documentElement.outerHTML +
      document.querySelector('conf-agenda').shadowRoot.innerHTML)
    const html = readFileSync(join(bundle, 'index.html'), 'utf8')
    const refs = [...runtimeRefs(html), ...runtimeRefs(rendered)]

    // Known-present, so "all relative" is not about an empty list.
    expect(refs).toContain('conf-agenda.js')
    for (const ref of refs) expect(ref, ref).not.toMatch(/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i)
  })

  test('the only absolute URLs in the bundle are the allowlisted inert ones', () => {
    // (c) Every file, so a file added later is scanned too.
    const allowed = [DORMANT, SITE]
    const found = new Map()
    for (const file of files(bundle)) {
      const text = readFileSync(file, 'latin1')
      for (const [url] of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
        found.set(url, relative(bundle, file))
      }
    }

    const unexpected = [...found].filter(([url]) => !allowed.some((a) => url.startsWith(a)))
    expect(unexpected, 'a new absolute reference in the bundle').toEqual([])

    // Known-present: both allowed strings really are there, so the scan works.
    expect([...found.keys()].some((u) => u.startsWith(DORMANT))).toBe(true)
    expect(found.get(SITE)).toBeDefined()
  })
})
