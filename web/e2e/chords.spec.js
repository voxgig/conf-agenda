import { test, expect } from '@playwright/test'

// `g` THEN A LETTER (PLATFORM §5.2, SPEC §13.1).
//
// The reader itself is unit tested; what needs a browser is the part that
// could not be: that it works APP-WIDE. The grid is not mounted when you are
// looking at the speaker list, and `g a` has to work from there, which is the
// whole reason the listener is on the document rather than in the grid.

async function signIn(page) {
  await page.goto('/')
  await page.fill('vg-auth input[name=email]', 'alice@example.com')
  await page.fill('vg-auth input[name=password]', 'alice-pass-01')
  await page.click('vg-auth button[type=submit]')
  await page.waitForSelector('.vg-shell')
}

const heading = (page) => page.locator('.vg-entity-head h2').first()


test('g s goes to speakers, g a comes back to the grid', async ({ page }) => {
  await signIn(page)
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')

  await page.keyboard.press('g')
  await page.keyboard.press('s')
  await expect(heading(page)).toHaveText(/speaker/i)

  // AND BACK, from a view the grid component is not mounted in. This is the
  // assertion the whole design is for.
  await expect(page.locator('vg-view-cag-fixture')).toHaveCount(0)
  await page.keyboard.press('g')
  await page.keyboard.press('a')
  await page.waitForSelector('.vg-grid')
  await expect(page.locator('vg-view-cag-fixture')).toHaveCount(1)
})


test('a chord works without the grid ever having had focus', async ({ page }) => {
  // Straight from the landing view, no click into the grid first.
  await signIn(page)
  await page.keyboard.press('g')
  await page.keyboard.press('s')
  await expect(heading(page)).toHaveText(/speaker/i)
})


test('g alone does nothing, and a mistyped chord does nothing', async ({ page }) => {
  await signIn(page)
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')
  await page.locator('vg-view-cag-fixture').click()

  const before = await page.locator('[data-session]').count()

  await page.keyboard.press('g')
  await page.waitForTimeout(200)
  await expect(page.locator('vg-view-cag-fixture')).toHaveCount(1)

  // `g` then `d` must NOT duplicate a session. The second letter of a chord
  // is consumed even when it maps to nothing, which is the point: `d` and `t`
  // are both live bindings on this grid.
  await page.keyboard.press('d')
  await page.waitForTimeout(700)
  await expect(page.locator('[data-session]')).toHaveCount(before)
  await expect(page.locator('.ca-toast')).toHaveCount(0)
})


test('typing g into the command bar does not navigate', async ({ page }) => {
  // Fields own their own keystrokes, the same rule the grid's handler follows.
  await signIn(page)
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')
  await page.locator('vg-view-cag-fixture').click()

  await page.keyboard.press('Control+k')
  await expect(page.locator('[data-bar]')).toBeVisible()
  await page.keyboard.type('gs')
  await page.waitForTimeout(300)

  await expect(page.locator('vg-view-cag-fixture')).toHaveCount(1)
  await page.keyboard.press('Escape')
})


test('a chord does not navigate out from under a confirmation', async ({ page }) => {
  // An open dialog owns the keyboard. Leaving mid-confirmation leaves the
  // thing it was confirming half-answered.
  await signIn(page)
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')
  await page.locator('vg-view-cag-fixture').click()

  await page.keyboard.press('P')
  await expect(page.locator('[data-publish-confirm]')).toBeVisible()

  await page.keyboard.press('g')
  await page.keyboard.press('s')
  await page.waitForTimeout(300)
  await expect(page.locator('[data-publish-confirm]')).toBeVisible()

  await page.keyboard.press('Escape')
})


test('the chords are discoverable in the ? overlay', async ({ page }) => {
  // Nobody guesses a chord. The registry carries display-only entries so the
  // overlay and the command bar list them, even though the shell handles them.
  await signIn(page)
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')
  await page.locator('vg-view-cag-fixture').click()

  await page.keyboard.press('?')
  const keys = await page.locator('.vg-help .vg-kbd').allInnerTexts()
  expect(keys).toContain('g a')
  expect(keys).toContain('g s')

  // And not the two SPEC 13.1 names with no view behind them.
  const help = await page.locator('.vg-help').innerText()
  expect(help).not.toContain('g p')
  expect(help).not.toContain('g c')
})
