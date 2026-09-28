import { test, expect } from '@playwright/test'

// `P` AND THE PUBLISH CONFIRMATION (SPEC §13.1, mockups/src/PublishConfirm.dc.html).
//
// §13.1 asks `P` to confirm "and state what changed since the last publish".
// Both halves are assertions here: the screen opens, and it says what would
// change rather than only asking.
//
// The default conference opens with a deliberate room clash, which makes the
// blocked path the one that runs without arranging anything. SPEC §16 makes
// errors a hard gate, and the useful thing to prove is that the screen says so
// BEFORE the button is pressed rather than the button failing when it is.

async function signIn(page) {
  await page.goto('/')
  await page.fill('vg-auth input[name=email]', 'alice@example.com')
  await page.fill('vg-auth input[name=password]', 'alice-pass-01')
  await page.click('vg-auth button[type=submit]')
  await page.waitForSelector('.vg-shell')
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')
  await page.locator('vg-view-cag-fixture').click()
}

const panel = (page) => page.locator('[data-publish-confirm]')

/** Switch to the other conference, which validates clean and can publish. */
async function openPublishable(page) {
  const picker = page.locator('.ca-confsel')
  if (0 === await picker.count()) return false
  if ('SELECT' !== await picker.evaluate((e) => e.tagName)) return false

  const values = await picker.locator('option').evaluateAll((os) => os.map((o) => o.value))
  const current = await picker.inputValue()
  const other = values.find((v) => v !== current)
  if (!other) return false

  await picker.selectOption(other)
  await page.waitForTimeout(600)
  return true
}


test('P opens the confirmation, Esc closes it', async ({ page }) => {
  await signIn(page)
  await expect(panel(page)).toHaveCount(0)

  await page.keyboard.press('P')
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toContainText('Publish')

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})


test('it refuses while errors remain, and says so before the button', async ({ page }) => {
  // The tiny conference opens with a room clash on purpose.
  await signIn(page)
  await page.keyboard.press('P')
  await expect(panel(page)).toBeVisible()

  await expect(page.locator('.ca-pub-state')).toContainText('blocked')
  await expect(page.locator('[data-publish]')).toBeDisabled();
  await expect(page.locator('[data-publish]')).toContainText(/Fix \d+ error/)

  // And `v` from here goes to look at them, which is the useful answer to
  // "fix them first".
  await page.keyboard.press('v')
  await expect(page.locator('[data-validate]')).toBeVisible()
  await page.keyboard.press('Escape')
})


test('it states what changed, not just "are you sure?"', async ({ page }) => {
  await signIn(page)
  test.skip(!(await openPublishable(page)), 'only one conference to work with')

  // Move something so there is a change to state.
  const title = await page.locator('.vg-focus .vg-strong').first().innerText()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.ca-toast')).toBeVisible()
  await expect(page.locator('.ca-ghost')).toHaveCount(0)

  await page.keyboard.press('P')
  await expect(panel(page)).toBeVisible()

  await expect(page.locator('.ca-pub-label')).toContainText('SINCE LAST PUBLISH')
  const moved = page.locator('.ca-pub-change').filter({ hasText: title })
  await expect(moved).toHaveCount(1)
  // A VERB, and a room NAME rather than a room id.
  await expect(moved.locator('.ca-pub-verb')).toHaveText(/moved|room/)

  // The button names the count rather than saying "publish".
  await expect(page.locator('[data-publish]')).toContainText(/Publish \d+ change/)

  await page.keyboard.press('Escape')
  await page.keyboard.press('u')
  await page.waitForTimeout(800)
})


test('it names what publishing touches, and that calendars are separate', async ({ page }) => {
  // An organiser who thinks publishing tells their speakers has not told their
  // speakers. Publishing and syncing are two acts and the screen says so.
  await signIn(page)
  await page.keyboard.press('P')
  await expect(panel(page)).toBeVisible()

  const note = page.locator('.ca-pub-note')
  await expect(note).toContainText('agenda.json')
  await expect(note).toContainText('Speaker calendars are synced separately')
})


test('Enter publishes, and the header says so afterwards', async ({ page }) => {
  await signIn(page)
  test.skip(!(await openPublishable(page)), 'only one conference to work with')

  await page.keyboard.press('P')
  await expect(panel(page)).toBeVisible()
  await expect(page.locator('[data-publish]')).toBeEnabled()

  await page.keyboard.press('Enter')

  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('.ca-toast')).toContainText('Published')
  // The header's publish state comes from load:tree, so this also asserts the
  // grid refetched rather than only rendering a toast.
  await expect(page.locator('.ca-pubstate')).toContainText(/just now|Published/)
})


test('P is advertised in the footer and the overlay', async ({ page }) => {
  // The registry gives this for free: one entry, four readers. It is asserted
  // because the whole point of the registry is that it cannot drift.
  await signIn(page)

  // The footer lower-cases labels; the overlay does not.
  expect(await page.locator('.ca-foot').innerText()).toContain('publish')

  await page.keyboard.press('?')
  const helpKeys = await page.locator('.vg-help .vg-kbd').allInnerTexts()
  expect(helpKeys).toContain('P')
})


test('deleting a session is command-bar only, and takes two steps', async ({ page }) => {
  // remove:segment declares no inverse on purpose, so there is no `u` behind
  // this and the confirmation is the only guard. A destructive action with one
  // guard should not also be one keystroke away.
  await signIn(page)

  // Not a key, and not advertised.
  expect(await page.locator('.ca-foot').innerText()).not.toContain('Delete')
  await page.keyboard.press('?')
  const helpText = await page.locator('.vg-help').innerText()
  expect(helpText).not.toContain('Delete session')
  await page.keyboard.press('?')

  // MAKE ITS OWN SESSION TO DELETE. Deleting a seeded one is permanent (there
  // is no inverse), and the first version of this test quietly took the tiny
  // conference's deliberate room clash with it, which broke validate-panel two
  // files later. e2e shares one backend, so a destructive test restores what
  // it touched or brings its own.
  const seeded = await page.locator('[data-session]').count()
  await page.keyboard.press('n')
  await expect(page.locator('.ca-toast')).toBeVisible()
  await expect(page.locator('[data-session]')).toHaveCount(seeded + 1)

  const before = await page.locator('[data-session]').count()
  const title = await page.locator('.vg-focus .vg-strong').first().innerText()

  await page.keyboard.press('Control+k')
  await expect(page.locator('[data-bar] li[data-command="Delete session"]')).toBeVisible()
  await page.keyboard.type('delete')
  await page.keyboard.press('Enter')

  // ARMED, not gone. And it offers the alternative an organiser usually wants.
  await expect(page.locator('.ca-toast')).toContainText('Press Enter to confirm')
  await expect(page.locator('.ca-toast')).toContainText('t to cancel it instead')
  await expect(page.locator('[data-session]')).toHaveCount(before)

  await page.keyboard.press('Enter')
  await expect(page.locator('.ca-toast')).toContainText('Deleted ' + title)
  await expect(page.locator('[data-session]')).toHaveCount(before - 1)

  // Back to the seeded count, so the next spec finds what it expects.
  await expect(page.locator('[data-session]')).toHaveCount(seeded)
})
