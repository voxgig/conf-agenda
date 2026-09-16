import { test, expect } from '@playwright/test'

// A JSON document in an entity column.
//
// `cag/snapshot.agenda_json` holds the whole published agenda. Rendered raw it
// is one enormous line: it stretched the row past the viewport, squeezed every
// other column to a two-character ribbon, and - because the app picks a label
// field by key order - the entire document became the detail page's heading.
//
// The fix is contextual rendering (customise.js): a derived summary in a list,
// the document itself collapsed behind a <details> on the detail page. These
// assertions pin the property that matters - the blob never renders in full
// where it is not asked for.

async function openSnapshots(page) {
  await page.goto('/')
  await page.fill('vg-auth input[name=email]', 'alice@example.com')
  await page.fill('vg-auth input[name=password]', 'alice-pass-01')
  await page.click('vg-auth button[type=submit]')
  await page.waitForSelector('.vg-shell')
  await page.click('.vg-navlink:has-text("Snapshot")')
  await page.waitForSelector('.vg-table')
}

test('the list shows a summary, not the document', async ({ page }) => {
  await openSnapshots(page)

  const summary = page.locator('.vg-json-summary').first()
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('sessions')
  await expect(summary).toContainText('KB')

  // The giveaway that the raw document leaked into the row.
  await expect(page.locator('.vg-table')).not.toContainText('schemaVersion')
})

test('the detail page is titled by slug, with the document collapsed', async ({ page }) => {
  await openSnapshots(page)
  await page.click('.vg-open')
  await page.waitForSelector('.vg-detail')

  // The heading is the slug. It used to be 3.4KB of JSON.
  const heading = page.locator('.vg-entity-head h2')
  await expect(heading).toHaveText(/^[a-z0-9-]+$/)

  const details = page.locator('details.vg-json')
  await expect(details).toHaveCount(1)
  // Collapsed: the <pre> exists in the DOM but is not rendered.
  await expect(details.locator('pre')).toBeHidden()

  await details.locator('summary').click()
  await expect(details.locator('pre')).toBeVisible()
  await expect(details.locator('pre')).toContainText('"schemaVersion"')
})

test('epoch milliseconds render as a date', async ({ page }) => {
  await openSnapshots(page)
  await page.click('.vg-open')
  await page.waitForSelector('.vg-detail')

  // published_at is UTC epoch ms. A raw 13-digit integer is unreadable and,
  // worse, not comparable by eye across rows.
  const row = page.locator('.vg-detail tr', { has: page.locator('th:text-is("Published at")') })
  await expect(row.locator('td')).not.toHaveText(/^\d{13}$/)
  await expect(row.locator('td span')).toHaveAttribute('title', /^\d{4}-\d{2}-\d{2}T/)
})
