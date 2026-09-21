import { test, expect } from '@playwright/test'

// Row actions on the entity list.
//
// Three bordered buttons per row (Open / Edit / Delete) became a row that
// opens on click plus a ⋯ overflow menu. The properties worth pinning are the
// ones a restyle can quietly break: the menu has to stay reachable from the
// keyboard, and Delete has to take two presses.
//
// Delete used to be ONE CLICK with no confirmation, no dialogue and no undo,
// on every row of every entity. The menu made it easier to reach, so the
// second press is not a nicety.

async function openList(page, entity) {
  await page.goto('/')
  await page.fill('vg-auth input[name=email]', 'alice@example.com')
  await page.fill('vg-auth input[name=password]', 'alice-pass-01')
  await page.click('vg-auth button[type=submit]')
  await page.waitForSelector('.vg-shell')
  await page.click(`.vg-navlink:has-text("${entity}")`)
  // Wait for THIS entity's table, not for any table. The previous list is
  // still in the DOM for a moment, so a bare `.vg-table tbody tr` resolves
  // against it - and a row count taken then belongs to the wrong entity.
  await expect(page.locator('.vg-entity-head h2')).toHaveText(new RegExp(entity, 'i'))
  await page.waitForSelector('.vg-table tbody tr')
}

test('clicking a row opens it; clicking a reference link does not', async ({ page }) => {
  await openList(page, 'Speaker')

  const first = page.locator('.vg-table tbody tr[data-row]').first()
  const name = await first.locator('td').first().innerText()
  await first.click()

  await page.waitForSelector('.vg-detail')
  await expect(page.locator('.vg-entity-head h2')).toBeVisible()

  expect(name.length).toBeGreaterThan(0)
})

test('a reference link goes to its target; an unreachable one is not a link', async ({ page }) => {
  // Appearance references cag/speaker (readable) and sys/org (NOT readable -
  // it has no aim:web message). Both used to render as links, and the sys/org
  // one navigated straight to "Not found."
  await openList(page, 'Appearance')

  const ref = page.locator('.vg-table tbody .vg-ref').first()
  await expect(ref).toBeVisible()
  const label = await ref.innerText()
  await ref.click()
  await page.waitForSelector('.vg-detail')
  await expect(page.locator('.vg-entity-head h2')).toHaveText(label)

  await page.click('#vg-back')
  await page.waitForSelector('.vg-table tbody tr')
  // The org column is rendered flat, so there is nothing to click into a
  // dead end.
  await expect(page.locator('.vg-table tbody .vg-ref-flat').first()).toBeVisible()
  await expect(page.locator('.vg-table tbody a.vg-ref[data-canon="sys/org"]')).toHaveCount(0)
})

test('the ⋯ menu is keyboard reachable and Escape closes it', async ({ page }) => {
  await openList(page, 'Speaker')

  const btn = page.locator('.vg-rowmenu-btn').first()
  // In the tab order and focusable, even though it is transparent until the
  // row is hovered - that is the whole point of using opacity, not display.
  await btn.focus()
  await expect(btn).toBeFocused()

  await btn.press('Enter')
  await expect(btn).toHaveAttribute('aria-expanded', 'true')

  const pop = page.locator('.vg-rowmenu-pop').first()
  await expect(pop).toBeVisible()
  await expect(pop.locator('[role=menuitem]')).toHaveCount(3)

  await page.keyboard.press('Escape')
  await expect(pop).toBeHidden()
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  // Focus returns to the trigger rather than to nowhere (K8).
  await expect(btn).toBeFocused()
})

test('a read-only entity says why, rather than silently doing nothing', async ({ page }) => {
  // GATING IS PER ENTITY NOW. A published snapshot is written by
  // publish:fixture, not by hand - an admin that could edit one could make
  // the public agenda disagree with the programme it was built from.
  //
  // The controls used to be off for EVERY entity because writes did not
  // exist. Delete awaited the refusal, threw it away and re-rendered, which
  // looks exactly like a successful delete of a row that is still there.
  await openList(page, 'Snapshot')

  const before = await page.locator('.vg-table tbody tr[data-row]').count()

  await expect(page.locator('.vg-entity-head .vg-chip')).toHaveText('read-only')
  await expect(page.locator('#vg-new')).toBeDisabled()
  await expect(page.locator('#vg-new')).toHaveAttribute('title', /publishing/)

  await page.locator('.vg-rowmenu-btn').first().click()
  const pop = page.locator('.vg-rowmenu-pop').first()
  await expect(pop.locator('.vg-open')).toBeEnabled()
  await expect(pop.locator('.vg-edit')).toBeDisabled()
  await expect(pop.locator('.vg-del')).toBeDisabled()

  await expect(page.locator('.vg-table tbody tr[data-row]')).toHaveCount(before)
})

test('a writable entity has live controls', async ({ page }) => {
  await openList(page, 'Speaker')

  await expect(page.locator('.vg-entity-head .vg-chip')).toHaveCount(0)
  await expect(page.locator('#vg-new')).toBeEnabled()

  await page.locator('.vg-rowmenu-btn').first().click()
  const pop = page.locator('.vg-rowmenu-pop').first()
  await expect(pop.locator('.vg-edit')).toBeEnabled()
  await expect(pop.locator('.vg-del')).toBeEnabled()
})

test('Delete takes two presses, and the first one is reversible', async ({ page }) => {
  // One click, no undo, on every row is not a thing to ship - and remove:
  // declares NO inverse on purpose, because re-creating a deleted row gives
  // it a new id and every reference to the old one would still be broken. So
  // the guard is the confirm step rather than the undo stack.
  await openList(page, 'Speaker')
  const before = await page.locator('.vg-table tbody tr[data-row]').count()

  await page.locator('.vg-rowmenu-btn').first().click()
  const del = page.locator('.vg-rowmenu-pop .vg-del').first()

  await del.click()
  // ARMED, not done. The menu stays open - the confirm button vanishing the
  // instant it appears is what an over-eager dismisser does.
  await expect(del).toHaveText(/confirm/i)
  await expect(page.locator('.vg-table tbody tr[data-row]')).toHaveCount(before)

  // Escape disarms as well as closing, because the popup is hidden rather
  // than re-rendered - an armed Delete would otherwise still be armed the
  // next time it opened.
  await page.keyboard.press('Escape')
  await page.locator('.vg-rowmenu-btn').first().click()
  await expect(page.locator('.vg-rowmenu-pop .vg-del').first()).toHaveText('Delete')
  await expect(page.locator('.vg-table tbody tr[data-row]')).toHaveCount(before)
})

test('New then Delete: a row round-trips through the intents', async ({ page }) => {
  // The whole point of this piece of work. It creates and then removes its
  // own row, so the list other specs see is unchanged - e2e runs workers=1
  // against one backend.
  await openList(page, 'Speaker')
  const before = await page.locator('.vg-table tbody tr[data-row]').count()

  await page.click('#vg-new')
  await page.waitForSelector('form')
  await page.fill('[name="name"]', 'Temp Testperson')
  await page.click('form button[type=submit]')

  await page.waitForSelector('.vg-table tbody tr')
  await expect(page.locator('.vg-table tbody tr[data-row]')).toHaveCount(before + 1)
  const row = page.locator('.vg-table tbody tr[data-row]').filter({ hasText: 'Temp Testperson' })
  await expect(row).toHaveCount(1)

  // And an edit, through update:speaker with exactly the editable fields.
  await row.locator('.vg-rowmenu-btn').click()
  // Scoped to THIS row: every row carries its own popup, so `.first()` picks
  // a hidden menu belonging to somebody else.
  await row.locator('.vg-edit').click()
  await page.waitForSelector('form')
  await page.fill('[name="name"]', 'Temp Renamed')
  await page.click('form button[type=submit]')
  await page.waitForSelector('.vg-table tbody tr')
  await expect(page.locator('.vg-table tbody tr[data-row]')
    .filter({ hasText: 'Temp Renamed' })).toHaveCount(1)

  // Put the list back.
  const renamed = page.locator('.vg-table tbody tr[data-row]').filter({ hasText: 'Temp Renamed' })
  await renamed.locator('.vg-rowmenu-btn').click()
  const del = renamed.locator('.vg-del')
  await del.click()
  await expect(del).toHaveText(/confirm/i)
  await del.click()
  await expect(page.locator('.vg-table tbody tr[data-row]')).toHaveCount(before)
})

test('deleting a row something still references is refused, and says what holds it', async ({ page }) => {
  // Deleting a room a session points at turns every one of those sessions
  // into an unknown-reference at validate time - the organiser would find out
  // at publish rather than at the click.
  await openList(page, 'Room')
  const before = await page.locator('.vg-table tbody tr[data-row]').count()

  await page.locator('.vg-rowmenu-btn').first().click()
  const del = page.locator('.vg-rowmenu-pop .vg-del').first()
  await del.click()
  await del.click()

  await expect(page.locator('#vg-count')).toContainText('Still in use')
  await expect(page.locator('.vg-table tbody tr[data-row]')).toHaveCount(before)
})

test('the list table fills the content area', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openList(page, 'Appearance')

  const main = await page.locator('.vg-main').boundingBox()
  const wrap = await page.locator('.vg-table-wrap').boundingBox()
  // It used to stop at 1024px whatever the screen. Allow for the gutter, but
  // a third of the content area sitting empty is the bug being fixed.
  expect(wrap.width).toBeGreaterThan(main.width * 0.9)
})

test('the menu stays on screen on the last row', async ({ page }) => {
  // The table wrapper clips - it is what rounds the corners and carries the
  // horizontal scroll - so an absolutely-positioned menu was cut off on the
  // last rows. It is placed with position:fixed and flipped upward when there
  // is no room below.
  await page.setViewportSize({ width: 1600, height: 760 })
  await openList(page, 'Appearance')

  const buttons = page.locator('.vg-rowmenu-btn')
  const last = (await buttons.count()) - 1
  expect(last).toBeGreaterThan(5)

  for (const i of [0, last]) {
    await buttons.nth(i).click({ force: true })
    const box = await page.locator('.vg-rowmenu-pop').nth(i).boundingBox()
    // Fully on screen, and not collapsed: clearing `top` instead of setting it
    // to `auto` left the stylesheet's own top in play, and a fixed element
    // with both top and bottom is stretched between them - 10px tall.
    expect(box.height).toBeGreaterThan(60)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(760)
    await page.keyboard.press('Escape')
  }
})
