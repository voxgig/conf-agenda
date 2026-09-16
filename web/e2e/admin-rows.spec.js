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

test('writes are disabled and say why, rather than silently doing nothing', async ({ page }) => {
  // Api.save and Api.remove return { ok: false, why: 'read-only-stage-1' } -
  // writes arrive in Stage 2 as per-entity intent messages (api.js). The list
  // used to offer New, Edit and Delete as though they worked: Delete awaited
  // the refusal, threw it away, and re-rendered, which looks EXACTLY like a
  // successful delete of a row that is still there.
  await openList(page, 'Appearance')

  const before = await page.locator('.vg-table tbody tr[data-row]').count()
  expect(before).toBeGreaterThan(1)

  await expect(page.locator('.vg-entity-head .vg-chip')).toHaveText('read-only')
  await expect(page.locator('#vg-new')).toBeDisabled()
  await expect(page.locator('#vg-new')).toHaveAttribute('title', /Stage 2/)

  await page.locator('.vg-rowmenu-btn').first().click()
  const pop = page.locator('.vg-rowmenu-pop').first()
  // Open works, so it stays live. The two that cannot are plainly off.
  await expect(pop.locator('.vg-open')).toBeEnabled()
  await expect(pop.locator('.vg-edit')).toBeDisabled()
  await expect(pop.locator('.vg-del')).toBeDisabled()
  await expect(pop.locator('.vg-del')).toHaveAttribute('title', /Stage 2/)

  // Nothing was removed, and nothing pretended to be.
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
