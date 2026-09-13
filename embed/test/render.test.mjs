/* Does <conf-agenda> actually render? SPEC 18 specifies Playwright on a
 * fixture page; this is that, run against the built bundle and the agenda.json
 * the real publish pipeline produced.
 *
 * The page it loads is deliberately hostile: it sets `table { border: 6px
 * dashed red !important }` and a global letter-spacing, so a leak would show.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { homedir } from 'node:os'
import { globSync } from 'node:fs'

const ROOT = process.cwd()
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
                '.cjs': 'text/javascript', '.json': 'application/json' }

async function open() {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(base + '/test/index.html')
  await page.waitForFunction(
    () => document.querySelector('#a')?.shadowRoot?.querySelector('table'),
    null, { timeout: 10000 },
  )
  return { page, errors }
}

let server
let browser
let base

describe('<conf-agenda> on a third-party page', () => {

before(async () => {
  server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    const file = join(ROOT, rel)
    if (!existsSync(file) || !file.startsWith(ROOT)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + server.address().port
  // Reuse a chromium already in the Playwright cache rather than downloading
  // another. Set CHROMIUM_PATH to override; with neither, fall back to
  // Playwright's own resolution (`npx playwright install chromium`).
  const cached = [
    process.env.CHROMIUM_PATH,
    ...globSync(join(homedir(), '.cache/ms-playwright/chromium-*/chrome-linux/chrome')),
  ].filter((p) => p && existsSync(p))

  browser = await chromium.launch(cached.length ? { executablePath: cached[0] } : {})
})

after(async () => {
  await browser?.close()
  server?.close()
})

  test('renders the grid as a real table with proper headers', async () => {
    const { page, errors } = await open()

    const shape = await page.evaluate(() => {
      const sr = document.querySelector('#a').shadowRoot
      return {
        caption: sr.querySelector('caption')?.textContent,
        colHeaders: [...sr.querySelectorAll('thead th')].map((n) => n.textContent),
        rowHeaders: [...sr.querySelectorAll('th[scope="row"]')].map((n) => n.textContent),
        sessions: [...sr.querySelectorAll('td.session .title')].map((n) => n.textContent),
      }
    })

    assert.equal(shape.caption, 'Tiny Conf 2027')
    // Rooms are column headers, times are row headers - a screen reader gets
    // "Room A, 10:00" for a cell with no ARIA bolted on.
    assert.deepEqual(shape.colHeaders, ['Time', 'Room A', 'Room B'])
    assert.ok(shape.rowHeaders.length > 0, 'time labels are row headers')
    assert.ok(shape.sessions.includes('Opening Keynote'))
    assert.ok(shape.sessions.includes('Coffee'))
    assert.deepEqual(errors, [], 'no page errors')

    await page.close()
  })

  test('times render in the conference zone, not the browser zone', async () => {
    const { page } = await open()
    const first = await page.evaluate(
      () => document.querySelector('#a').shadowRoot.querySelector('th[scope="row"]').textContent,
    )
    // Europe/Dublin in November is GMT, and the keynote starts at 09:00.
    assert.equal(first, '09:00')
    await page.close()
  })

  test('no speaker email reaches the rendered DOM', async () => {
    const { page } = await open()
    // The rendered content only - the shadow root's <style> legitimately
    // contains `@media`, so scanning innerHTML wholesale would match that.
    const html = await page.evaluate(() =>
      [...document.querySelector('#a').shadowRoot.children]
        .filter((n) => 'STYLE' !== n.tagName)
        .map((n) => n.outerHTML)
        .join(''),
    )
    assert.ok(!html.includes('@'), 'C6 holds all the way to the pixels')
    assert.ok(!html.includes('example.invalid'), 'no address from the fixture')
    await page.close()
  })

  test('host page styles do not leak into the component', async () => {
    const { page } = await open()
    const styles = await page.evaluate(() => {
      const t = document.querySelector('#a').shadowRoot.querySelector('table')
      const cs = getComputedStyle(t)
      return { border: cs.borderTopStyle, spacing: cs.letterSpacing }
    })
    // The host page sets `table { border: 6px dashed red !important }`.
    assert.notEqual(styles.border, 'dashed', 'host table border leaked in')
    await page.close()
  })

  test('two instances on one page do not collide', async () => {
    const { page } = await open()
    const both = await page.evaluate(() => ({
      a: !!document.querySelector('#a').shadowRoot.querySelector('table'),
      b: !!document.querySelector('#b').shadowRoot.querySelector('.session'),
    }))
    assert.equal(both.a, true, 'grid instance')
    assert.equal(both.b, true, 'list instance, same data, different view')
    await page.close()
  })

  test('a missing source degrades honestly - a message, not an empty box', async () => {
    const { page } = await open()
    const text = await page.evaluate(
      () => document.querySelector('#c').shadowRoot.textContent,
    )
    assert.match(text, /could not be loaded/)
    assert.ok(!/Error|stack|TypeError/.test(text), 'no stack trace on a stranger site')
    await page.close()
  })

  test('emits conf-agenda:ready', async () => {
    const { page } = await open()
    const log = await page.evaluate(() => document.getElementById('log').textContent)
    assert.match(log, /conf-agenda:ready/)
    assert.match(log, /conf-agenda:error/, 'and error, from the broken instance')
    await page.close()
  })
})
