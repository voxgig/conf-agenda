import { test, expect } from '@playwright/test'

// The sync plan (mockups/src/SyncPlan.dc.html).
//
// The screen exists to make the ledger VISIBLE. Everything the reconciliation
// does is invisible by construction — its job is to not send things — so
// without this screen "we never send a duplicate" is a claim an organiser has
// to take on faith.
//
// The assertion that matters most is the quiet grey row: N further segments,
// hash unchanged, no-op, zero provider calls. That line is C2 shown.

async function openGrid(page) {
  await page.goto('/')
  await page.fill('vg-auth input[name=email]', 'alice@example.com')
  await page.fill('vg-auth input[name=password]', 'alice-pass-01')
  await page.click('vg-auth button[type=submit]')
  await page.waitForSelector('.vg-shell')
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')

  // The two-day conference: it is the one with a synced history.
  const picker = page.locator('.ca-confsel')
  if (await picker.count() && 'SELECT' === await picker.evaluate((e) => e.tagName)) {
    const values = await picker.locator('option').evaluateAll((os) => os.map((o) => o.value))
    const current = await picker.inputValue()
    const other = values.find((v) => v !== current)
    if (other) {
      await picker.selectOption(other)
      await page.waitForTimeout(500)
    }
  }
  await page.locator('vg-view-cag-fixture').click()
}

test('S opens the plan, Esc returns to the grid', async ({ page }) => {
  await openGrid(page)

  await page.keyboard.press('S')
  await expect(page.locator('.ca-sync-table')).toBeVisible()
  await expect(page.locator('.vg-grid')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('.vg-grid')).toBeVisible()
  await expect(page.locator('.ca-sync-table')).toHaveCount(0)
})

test('it says PLAN — NOTHING SENT, and Apply is not live', async ({ page }) => {
  await openGrid(page)
  await page.keyboard.press('S')

  // The loudest thing on the page. This screen is one keystroke from one that
  // would send.
  await expect(page.locator('.ca-plan-badge')).toHaveText('PLAN — NOTHING SENT')

  // C4: the confirmation STATES what it is confirming. "Are you sure?" asks
  // nothing; "send 2" is a number the organiser can disagree with.
  const apply = page.locator('[data-apply]')
  await expect(apply).toHaveText(/Apply — send \d+/)
  await expect(apply).toHaveAttribute('title', /Sends \d+ change/)
})

test('the no-op row is present — C2 shown, not claimed', async ({ page }) => {
  await openGrid(page)
  await page.keyboard.press('S')

  const quiet = page.locator('.ca-sync-row--quiet')
  await expect(quiet).toHaveCount(1)
  await expect(quiet).toContainText(/further segment/)
  await expect(quiet).toContainText('hash unchanged')
  await expect(quiet).toContainText('zero provider calls')
})

test('a cancellation and an update read in words, not hashes', async ({ page }) => {
  await openGrid(page)
  await page.keyboard.press('S')

  // The cancelled segment: struck through, and the reason names the ordering
  // that makes it work at all.
  const cancelled = page.locator('.ca-sync-row--cancel')
  await expect(cancelled).toHaveCount(1)
  await expect(cancelled).toContainText('checked before hash')
  await expect(cancelled.locator('.ca-act--cancel')).toContainText('tombstone')

  // The update: same UID is the whole of C3, so it is on the screen.
  const update = page.locator('.ca-act--update').first()
  await expect(update).toContainText('same UID, seq+1')

  // "attendee set", never "hash-changed" — an organiser shown a hash has been
  // told nothing.
  await expect(page.locator('.ca-sync-table')).toContainText('attendee set')
  await expect(page.locator('.ca-sync-table')).not.toContainText('hash-changed')
})

test('the footer states the counts and the three rules', async ({ page }) => {
  await openGrid(page)
  await page.keyboard.press('S')

  const summary = page.locator('.ca-sync-summary')
  // C4: the confirmation has to state what it is confirming.
  await expect(summary).toContainText(/calendar change/)
  await expect(summary).toContainText(/speaker/)
  await expect(summary).toContainText('Outbound cap')
  await expect(summary).toContainText('one sync at a time per conference')
  await expect(summary).toContainText('never a duplicate')
})

test('connected accounts show, and carry no secret', async ({ page }) => {
  await openGrid(page)
  await page.keyboard.press('S')

  await expect(page.locator('.ca-account')).toHaveCount(1)
  await expect(page.locator('.ca-account')).toContainText('fake')
  // The account object reaches the browser (C7).
  await expect(page.locator('.ca-accounts')).not.toContainText('sekreto')
})

// ---------------------------------------------------------------------------
// APPLYING, and the run screen (mockups/src/SyncRun.dc.html).
//
// These run LAST in the file on purpose: applying mutates the shared dev store
// that every spec in this project shares (one worker, one backend), so a test
// that applies must not run before one that expects something to send.

test('Apply runs the plan, and the run screen reaches SENT', async ({ page }) => {
  await openGrid(page)
  await page.keyboard.press('S')

  const apply = page.locator('[data-apply]')
  await expect(apply).toBeEnabled()
  await apply.click()

  // The run screen. Per-segment state, not a spinner.
  await expect(page.locator('.ca-run-table')).toBeVisible()
  await expect(page.locator('[data-progress]')).toContainText(/no-ops skipped/)

  // THE REGRESSION THIS EXISTS FOR. The SPA caches any aim:web message
  // carrying a `get` key as a read, and invalidates only on a client-side
  // WRITE. A sync run has neither property - it changes on the server, as the
  // queue works. Named `get:run` the first poll was cached and every later one
  // returned "pending" for ever, while the run had long since finished: the
  // screen and the truth silently disagreed. The message is `watch:run` so the
  // cache passes it through, and this assertion is what catches a rename back.
  await expect(page.locator('.ca-run-st--sent').first()).toBeVisible({ timeout: 15000 })
  await expect(page.locator('[data-progress]')).toContainText(/^(\d+) of \1 /)

  // Named, not numbered.
  await expect(page.locator('.ca-sync-title')).toContainText('Calendar sync')
  await expect(page.locator('.ca-sync-title')).not.toContainText('demo_conf')

  await page.keyboard.press('Escape')
  await expect(page.locator('.vg-grid')).toBeVisible()
})

test('a second Apply is refused while nothing is left to send', async ({ page }) => {
  // The previous test applied, so every segment is now up to date. An Apply
  // that would send nothing still takes a lock and writes a run, so it is off.
  await openGrid(page)
  await page.keyboard.press('S')

  await expect(page.locator('[data-apply]')).toBeDisabled()
  await expect(page.locator('[data-apply]')).toHaveText('Apply — send 0')
  await expect(page.locator('.ca-sync-row--quiet')).toContainText('zero provider calls')
})
