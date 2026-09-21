import { test, expect } from '@playwright/test'
import Fs from 'node:fs'
import Path from 'node:path'

// BUS-DRIVE (PLATFORM §10, SPEC §18).
//
//   "A Playwright spec drives a full user journey through window.seneca.post()
//    with ZERO DOM interaction, asserting only that the DOM followed. Without
//    it, 'drivable by messages' decays into 'was built that way once'."
//
// The journey SPEC §18 names: sign in, open a conference, create a session,
// move it between rooms, publish. Every step is a post; every assertion is
// that the DOM followed.
//
// THE ONE RULE THIS FILE LIVES BY: no click(), no fill(), no keyboard.press().
// The only DOM access is reading, to assert. A single `page.click` here and
// the spec silently stops proving anything - so there is a test at the bottom
// that greps this file for those calls.
//
// Writing it found two gaps, which is the point of having it. Navigation was
// click-only (`a.onclick -> this.openEntity()`), and publish:fixture had no
// aim:web proxy at all - so the journey's first and last steps were not
// message-drivable. Both are now.

const USER = { email: 'alice@example.com', password: 'alice-pass-01' }

/** Post on the page's own bus. This is the ONLY way this spec touches the app. */
function post(page, msg) {
  return page.evaluate((m) => window.seneca.post(m), msg)
}

/** The app is a custom-element tree; give it a tick to re-render. */
const settled = (locator) => expect(locator).toBeVisible({ timeout: 10000 })


test('a full journey, driven by messages alone', async ({ page }) => {
  await page.goto('/')

  // --- the bus is reachable at all ---------------------------------------
  await expect.poll(() => page.evaluate(() => 'function' === typeof window.seneca?.post))
    .toBe(true)

  // --- 1. sign in --------------------------------------------------------
  // Two messages, and the split is real: the first is the aim:web proxy that
  // authenticates, the second is the browser-local event the router listens
  // on (PLATFORM §1.2 - navigation and view switches live on the in-browser
  // bus). vg-auth posts exactly this pair when somebody uses the form.
  const auth = await post(page, {
    aim: 'web', on: 'auth', signin: 'user', email: USER.email, password: USER.password,
  })
  expect(auth.ok, JSON.stringify(auth)).toBe(true)

  await page.evaluate((u) => window.seneca.act('cmp:evt,name:auth', { data: { user: u } }),
    auth.user)

  // THE DOM FOLLOWED: the public site was replaced by the app shell.
  await settled(page.locator('.vg-shell'))
  await expect(page.locator('vg-public')).toHaveCount(0)

  // --- 2. open a conference ----------------------------------------------
  await page.evaluate(() =>
    window.seneca.act('cmp:evt,name:navigate', { data: { canon: 'cag/fixture' } }))
  await settled(page.locator('vg-view-cag-fixture .vg-grid'))

  // Name one explicitly, rather than taking whatever opened by default.
  const tree = await post(page, { aim: 'web', on: 'cag', load: 'tree' })
  expect(tree.ok).toBe(true)
  const conference = tree.top.id

  await page.evaluate((id) =>
    window.seneca.act('cmp:evt,name:conference', { data: { fixture_id: id } }), conference)
  await settled(page.locator('.ca-grid'))

  const roomIds = tree.rooms.map((r) => r.id)
  expect(roomIds.length, 'need two rooms to move between').toBeGreaterThan(1)

  // --- 3. create a session -----------------------------------------------
  const day = (tree.segments || []).find((s) => 'day' === s.kind)
  const parent_id = day ? day.id : conference
  const t_start = (day ? day.t_start : tree.top.t_start) + 20 * 3600000

  const made = await post(page, {
    aim: 'web', on: 'cag', make: 'segment',
    parent_id, room_id: roomIds[0], t_start, t_end: t_start + 1800000,
    title: 'Bus-driven session',
  })
  expect(made.ok, JSON.stringify(made)).toBe(true)

  // THE DOM FOLLOWED: the card is in the grid, in the room it was made in.
  const card = page.locator('[data-session="' + made.item.id + '"]')
  await settled(card)
  await expect(card).toContainText('Bus-driven session')
  await expect(card).toHaveAttribute('data-room', roomIds[0])

  // --- 4. move it between rooms ------------------------------------------
  const moved = await post(page, {
    aim: 'web', on: 'cag', move: 'segment',
    fixture_id: made.item.id, room_id: roomIds[1], t_start,
  })
  expect(moved.ok, JSON.stringify(moved)).toBe(true)

  // THE DOM FOLLOWED: same card, different room. This is the assertion that
  // catches a grid which renders from its own optimistic state and never
  // reconciles - the card would still read the old room.
  await expect(page.locator('[data-session="' + made.item.id + '"]'))
    .toHaveAttribute('data-room', roomIds[1], { timeout: 10000 })

  // --- 5. publish --------------------------------------------------------
  // It gates on validate:fixture, so a conference with errors refuses - which
  // is a real outcome to assert rather than something to arrange around.
  const check = await post(page, {
    aim: 'web', on: 'cag', validate: 'fixture', fixture_id: conference,
  })
  expect(check.ok).toBe(true)

  const published = await post(page, {
    aim: 'web', on: 'cag', publish: 'fixture', fixture_id: conference,
  })

  if (check.valid) {
    expect(published.ok, JSON.stringify(published)).toBe(true)
    expect(published.session_count).toBeGreaterThan(0)
  } else {
    // SPEC §16: errors are a HARD GATE on publish. The seeded conference has
    // a deliberate room clash, so this is the branch that usually runs - and
    // it is the more valuable of the two.
    expect(published.ok).toBe(false)
    expect(published.why).toBe('validation-failed')
    expect(published.error_count).toBeGreaterThan(0)
  }

  // --- and undo the session, so the next spec finds the data as seeded ----
  const removed = await post(page, {
    aim: 'web', on: 'cag', remove: 'segment', fixture_id: made.item.id,
  })
  expect(removed.ok, JSON.stringify(removed)).toBe(true)
  await expect(page.locator('[data-session="' + made.item.id + '"]')).toHaveCount(0)
})


test('the DOM is never touched by this spec', () => {
  // THE GUARD ON THE GUARD. A bus-drive spec that quietly grows a click stops
  // proving anything, and it would still pass - so the file reads itself.
  // PLATFORM §10's point is that "drivable by messages" decays into "was
  // built that way once" precisely when nobody is watching for this.
  // Read by PATH, not import.meta - Playwright transpiles these specs to CJS,
  // where import.meta is a syntax error and the whole file fails to load.
  const src = Fs.readFileSync(Path.join(process.cwd(), 'e2e', 'bus-drive.spec.js'), 'utf8')

  // Everything before this test's own body, with COMMENTS STRIPPED - the
  // header above names `keyboard.press()` in prose, and a guard that cannot
  // tell code from a comment fails on its own documentation.
  const journey = src
    .slice(0, src.indexOf("test('the DOM is never touched"))
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')

  for (const banned of ['.click(', '.fill(', '.press(', '.type(', '.hover(', '.dragTo(',
    '.selectOption(', '.check(', '.tap(', '.dblclick(', '.setInputFiles(']) {
    expect(journey.includes(banned),
      'bus-drive.spec.js uses ' + banned + ' — it is no longer driving by messages')
      .toBe(false)
  }

  // And it really does post: a spec that asserts nothing would also pass the
  // check above.
  const drives = (journey.match(/window\.seneca\.(post|act)\(/g) || []).length +
    (journey.match(/\bpost\(page,/g) || []).length
  expect(drives, 'this spec barely drives anything').toBeGreaterThan(6)
})
