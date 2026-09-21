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

  // K2: the bar shows the KEY BESIDE EACH COMMAND, and the key shown is the
  // key that runs it - both come from the same registry entry now.
  const sync = page.locator('[data-bar] li[data-command="Sync plan"]')
  await expect(sync).toBeVisible()
  await expect(sync.locator('.vg-kbd')).toHaveText('S')

  // Fuzzy-matched rather than single-letter: "every action, every navigation
  // target, every entity, fuzzy-matched" (K2). Type enough, press Enter.
  await page.keyboard.type('reload')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-bar]')).toBeHidden()
  await expect(page.locator('.vg-focus')).toHaveCount(1)
})

test('the ? overlay is GENERATED from the registry, so it cannot drift', async ({ page }) => {
  // SPEC 18: "the shortcut overlay is generated from the binding registry so
  // they cannot drift." They had drifted - the footer listed the Stage 2 keys
  // while the overlay still described a read-only grid.
  await signIn(page)
  await page.keyboard.press('?')

  const help = page.locator('.vg-help')
  await expect(help).toBeVisible()

  // Every key the footer advertises is in the overlay. The footer is the
  // registry filtered; the overlay is the registry whole.
  const footKeys = await page.locator('.ca-foot .vg-kbd').allInnerTexts()
  const helpKeys = await help.locator('.vg-kbd').allInnerTexts()
  for (const k of footKeys) {
    expect(helpKeys, 'the footer advertises ' + k + ' and the overlay does not list it')
      .toContain(k)
  }

  // And the overlay carries keys the footer has no room for - `u` is the one
  // that matters, because the toast offers it.
  expect(helpKeys).toContain('u')
})

test('? toggles the shortcut list', async ({ page }) => {
  await signIn(page)

  await expect(page.locator('[data-help]')).toBeHidden()
  await page.keyboard.press('?')
  await expect(page.locator('[data-help]')).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.locator('[data-help]')).toBeHidden()
})

// The focus ring and the detail panel must describe the SAME session.
//
// This exists because they did not. Cards are appended to the CSS grid room by
// room, so DOM order is room-major, while j/k walk the sessions in time order.
// paintFocus compared DOM POSITION against focusIndex, which agrees only when
// every session is in one room - which is exactly what the single-room default
// conference looks like, so all three tests above stayed green while the ring
// sat on one card and the panel described another.
//
// So it switches to the multi-room conference on purpose. A test that only
// ever sees the easy fixture is the vacuously-green failure this project has
// already been bitten by once.
test('on a multi-room conference, the ring and the panel agree', async ({ page }) => {
  await signIn(page)

  const picker = page.locator('.ca-confsel')
  await expect(picker).toHaveCount(1)
  const values = await picker.locator('option').evaluateAll((os) => os.map((o) => o.value))
  expect(values.length).toBeGreaterThan(1)

  const current = await picker.inputValue()
  await picker.selectOption(values.find((v) => v !== current))
  await page.waitForTimeout(500)

  // More than one room, or this asserts nothing.
  expect(await page.locator('.ca-roomh').count()).toBeGreaterThan(1)

  // Walk a few sessions; at every step the ring and the panel must match.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('j')
    await page.keyboard.press('Enter')
    const focused = await focusTitle(page)
    await expect(page.locator('[data-detail] h3')).toHaveText(focused)
  }
})
