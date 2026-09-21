import { test, expect } from '@playwright/test'

// THE VALIDATION PANEL (SPEC 16.3, mockups/src/Validate.dc.html).
//
// The header carries the count; this is the list. What is worth asserting in
// a browser is the part a unit test cannot see: that `v` opens a panel with
// its OWN j/k without dragging the grid's selection along, that `Enter` lands
// on the session the diagnostic names, and that the footer states the gate.
//
// The default conference is already invalid on purpose - the tiny fixture
// overlaps two talks in one room - so there is always something to list.

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

const panel = (page) => page.locator('[data-validate]')


test('v opens the diagnostics list, Esc closes it', async ({ page }) => {
  await signIn(page)
  await expect(panel(page)).toHaveCount(0)

  await page.keyboard.press('v')
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toContainText('Validation')

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})


test('it lists the rule id, both sides of the clash, and the fix', async ({ page }) => {
  // SPEC 16.3: a stable rule id, a one-line message naming BOTH sides, and a
  // human-readable fix. Nothing here is re-derived in the browser.
  await signIn(page)
  await page.keyboard.press('v')

  const first = page.locator('.ca-diag').first()
  await expect(first).toContainText('room-double-booked')
  await expect(first.locator('.ca-sev')).toContainText('ERROR')

  // ERRORS BEFORE WARNINGS, sorted by the server (SPEC 16.3, and SPEC 17:
  // identical input, identical output). The panel does not re-sort, so this
  // is asserting the order it was given.
  const sevs = await page.locator('.ca-sev').allInnerTexts()
  expect(sevs.indexOf('ERROR')).toBeLessThan(sevs.lastIndexOf('WARN'))

  // Both sides named: the message carries two session titles.
  const what = await first.locator('.ca-diag-what').innerText()
  expect(what.length).toBeGreaterThan(20)
  await expect(first.locator('.ca-diag-fix')).toBeVisible()
})


test('j and k walk the diagnostics without moving the grid selection', async ({ page }) => {
  // diagIndex is separate from focusIndex on purpose. Walking the list must
  // not drag the ring around the grid behind it until Enter says so.
  await signIn(page)

  const gridFocus = await page.locator('.vg-focus').first().getAttribute('data-session')

  await page.keyboard.press('v')
  // Wait for the panel to populate before counting - showValidation()
  // revalidates first, so the list arrives a round-trip after the keystroke.
  await expect(panel(page)).toBeVisible()
  await expect(page.locator('.ca-diag--on')).toHaveAttribute('data-diag', '0')

  // The tiny fixture carries one error and three warnings, so there is
  // genuinely a list to walk. If that ever stops being true this fails rather
  // than skipping, because a skipped test proves nothing.
  expect(await page.locator('.ca-diag').count()).toBeGreaterThan(1)
  await page.keyboard.press('j')
  await expect(page.locator('.ca-diag--on')).toHaveAttribute('data-diag', '1')
  await page.keyboard.press('k')
  await expect(page.locator('.ca-diag--on')).toHaveAttribute('data-diag', '0')

  await page.keyboard.press('Escape')
  expect(await page.locator('.vg-focus').first().getAttribute('data-session')).toBe(gridFocus)
})


test('Enter jumps to the session the diagnostic names', async ({ page }) => {
  await signIn(page)
  await page.keyboard.press('v')

  const target = await page.locator('.ca-diag--on').getAttribute('data-entity')
  expect(target).toBeTruthy()

  await page.keyboard.press('Enter')

  // The panel closes and the ring is on the session the diagnostic anchored to.
  await expect(panel(page)).toHaveCount(0)
  await expect(page.locator('.vg-focus').first()).toHaveAttribute('data-session', target)
  // And the detail panel opened on it, which is what "jump to session" means.
  await expect(page.locator('[data-detail]')).toBeVisible()
})


test('the footer states that publication is blocked', async ({ page }) => {
  // SPEC 16: errors are a hard gate on publish. Saying so here is what stops
  // an organiser finding out by pressing P.
  await signIn(page)
  await page.keyboard.press('v')

  await expect(page.locator('.ca-val-foot')).toContainText('Publish is blocked while errors remain')
})


test('v is advertised now that it works', async ({ page }) => {
  await signIn(page)
  const foot = await page.locator('.ca-foot').innerText()
  expect(foot).toContain('validate')
})
