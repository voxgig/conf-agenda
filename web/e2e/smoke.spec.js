import { test, expect } from '@playwright/test'

// Generic smoke test: the public site loads, a seeded user can sign in, and
// the model-driven app shell renders with an entity menu. Add project-specific
// flows (CRUD, relationship drill, settings) in your own spec files.

test('public site, sign in, and the app shell', async ({ page }) => {
  await page.goto('/')

  // Public content site with a login form.
  await expect(page.locator('vg-auth h2')).toHaveText('Sign in')

  await page.fill('vg-auth input[name=email]', 'alice@example.com')
  await page.fill('vg-auth input[name=password]', 'alice-pass-01')
  await page.click('vg-auth button[type=submit]')

  // The enterprise shell: top bar with the signed-in user, and a
  // model-driven entity menu with at least one entity.
  await expect(page.locator('.vg-shell')).toBeVisible()
  await expect(page.locator('.vg-user-btn')).toContainText('alice@example.com')
  await expect(page.locator('.vg-navlink')).not.toHaveCount(0)
})
