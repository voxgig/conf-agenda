import { test, expect } from '@playwright/test'

// The agenda grid's keyboard model (SPEC K1: an action that exists only behind
// a click is not finished; PLATFORM 5.2: j/k/Enter mean the same thing in both
// apps).
//
// This spec exists because the Cmd-K binding was DEAD for its whole life and
// no test noticed: `ev.key` is still 'k' when the modifier is held, so the
// bare `'k' === ev.key` case matched first and moved focus up instead of
// opening the command bar. A unit test over the handler would have had the
// same blind spot - it takes a real key event to catch it.

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

function focusTitle(page) {
  return page.locator('.vg-focus').first().locator('.vg-strong').first().innerText()
}

test('j and k move focus, Enter opens the detail panel', async ({ page }) => {
  await signIn(page)

  await page.keyboard.press('j')
  const first = await focusTitle(page)

  await page.keyboard.press('j')
  const second = await focusTitle(page)
  expect(second).not.toBe(first)

  // k is the inverse of j - a bare k must still move, which is what the
  // Cmd-K fix had to preserve.
  await page.keyboard.press('k')
  expect(await focusTitle(page)).toBe(first)

  await page.keyboard.press('Enter')
  await expect(page.locator('[data-detail]')).toContainText(first)
})

test('Cmd-K opens the command bar, and a command runs and closes it', async ({ page }) => {
  await signIn(page)

  await expect(page.locator('[data-bar]')).toBeHidden()

  await page.keyboard.press('Control+k')
  await expect(page.locator('[data-bar]')).toBeVisible()

  // 'g' - go to first session. The bar closes and the command has acted.
  await page.keyboard.press('g')
  await expect(page.locator('[data-bar]')).toBeHidden()
  await expect(page.locator('.vg-focus')).toHaveCount(1)
})

test('? toggles the shortcut list', async ({ page }) => {
  await signIn(page)

  await expect(page.locator('[data-help]')).toBeHidden()
  await page.keyboard.press('?')
  await expect(page.locator('[data-help]')).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.locator('[data-help]')).toBeHidden()
})
