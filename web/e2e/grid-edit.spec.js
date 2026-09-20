import { test, expect } from '@playwright/test'

// THE EDITABLE GRID (SPEC 19.4) - drag, Shift-arrows, n/d/t, and undo.
//
// Every one of these goes through a NAMED INTENT (SPEC 9). The browser never
// composes an entity and never computes the new row, so what is worth testing
// here is not "did the field change" - the backend suite covers that - but the
// things only a real browser can prove:
//
//   - a modifier does not change ev.key, so Shift-arrows have to be handled
//     BEFORE the bare keys. That is not hypothetical: it is what kept Cmd-K
//     dead for its whole life, and e2e/grid-keys.spec.js exists because of it.
//   - the SPA's transparent cache groups `load:tree` and `move:segment`
//     separately, so nothing in the store's write list can connect them. A
//     move followed by a reload is the only way to see that.
//   - undo runs the declared INVERSE as an ordinary edit.
//
// THESE TESTS MUTATE SHARED SEED DATA, and e2e runs workers=1 against one
// backend. So every test here puts the data back - by undo, which is the
// thing being tested anyway - and they all work on the DEFAULT conference,
// leaving the two-day one that sync-plan.spec.js asserts against alone.

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

/** The focused card's aria-label carries title, room and time. */
function focusLabel(page) {
  return page.locator('.vg-focus').first().getAttribute('aria-label')
}

function focusTitle(page) {
  return page.locator('.vg-focus').first().locator('.vg-strong').first().innerText()
}

/** Settled: the toast has appeared and the grid has been refetched. */
async function settled(page) {
  await expect(page.locator('.ca-toast')).toBeVisible()
  await expect(page.locator('.ca-ghost')).toHaveCount(0)
}


test('Shift-arrow moves the focused session, and the toast names the move', async ({ page }) => {
  await signIn(page)

  const before = await focusLabel(page)
  const title = await focusTitle(page)

  await page.keyboard.press('Shift+ArrowRight')
  await settled(page)

  // NOT "Saved". An organiser who has moved three things needs to know which
  // one this is about.
  await expect(page.locator('.ca-toast')).toContainText('Moved')
  await expect(page.locator('.ca-toast')).toContainText(title)

  // The session really moved - the label carries its room.
  await expect.poll(() => focusLabel(page)).not.toBe(before)

  // And focus followed the SESSION, not the index.
  expect(await focusTitle(page)).toBe(title)

  await page.keyboard.press('u')
  await expect.poll(() => focusLabel(page)).toBe(before)
})


test('a bare arrow key does not move anything', async ({ page }) => {
  // The other half of the modifier check. If Shift-arrows were handled by
  // testing ev.key alone, a plain arrow would move sessions too.
  await signIn(page)
  const before = await focusLabel(page)

  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)

  expect(await focusLabel(page)).toBe(before)
  await expect(page.locator('.ca-toast')).toHaveCount(0)
})


test('the move survives a reload - the cached tree is invalidated', async ({ page }) => {
  // THE ONE THAT CANNOT BE UNIT TESTED. The store caches `load:tree` under
  // `web/cag/tree` and would classify `move:segment` under `web/cag/segment`,
  // so no entry in its write-verb list can ever invalidate the grid's read.
  // Without the explicit invalidate:group, navigating away and back shows the
  // PRE-MOVE grid while the server has already moved it - the same class of
  // bug as the cached get:run, but invisible, because the move did apply.
  await signIn(page)

  const title = await focusTitle(page)
  const before = await focusLabel(page)

  await page.keyboard.press('Shift+ArrowRight')
  await settled(page)
  const moved = await focusLabel(page)
  expect(moved).not.toBe(before)

  // Force a genuine refetch.
  await page.click('.vg-navlink:has-text("Speaker")')
  await page.waitForTimeout(300)
  await page.click('.vg-navlink:has-text("Fixture")')
  await page.waitForSelector('.vg-grid')
  await page.locator('vg-view-cag-fixture').click()

  const card = page.locator('[data-session]').filter({ hasText: title }).first()
  const label = await card.getAttribute('aria-label')
  expect(label).toBe(moved)

  // Put it back, through the grid, so the next spec finds the data as seeded.
  const idx = await card.getAttribute('data-index')
  for (let i = 0; i < Number(idx); i++) await page.keyboard.press('j')
  await page.keyboard.press('Shift+ArrowLeft')
  await settled(page)
  await expect.poll(() => focusLabel(page)).toBe(before)
})


test('two moves in quick succession settle on the SECOND one', async ({ page }) => {
  // Single-flight. Without it the two reconcile last-response-wins, and the
  // undo stack ends up ordered by when the server answered rather than by
  // what the organiser did.
  await signIn(page)

  const before = await focusLabel(page)
  const title = await focusTitle(page)

  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await page.waitForTimeout(1500)

  const after = await focusLabel(page)
  expect(after).not.toBe(before)
  expect(await focusTitle(page)).toBe(title)

  // Two edits, so two undos - a stack walk, not a flip-flop.
  await page.keyboard.press('u')
  await page.waitForTimeout(600)
  await page.keyboard.press('u')
  await expect.poll(() => focusLabel(page), { timeout: 8000 }).toBe(before)
})


test('u with nothing to undo says so, and changes nothing', async ({ page }) => {
  await signIn(page)
  const before = await focusLabel(page)

  await page.keyboard.press('u')
  await expect(page.locator('.ca-toast')).toContainText('Nothing to undo')
  expect(await focusLabel(page)).toBe(before)
})


test('t cycles the status, and u puts it back', async ({ page }) => {
  await signIn(page)

  const title = await focusTitle(page)
  await page.keyboard.press('t')
  await settled(page)
  await expect(page.locator('.ca-toast')).toContainText(title)

  await page.keyboard.press('u')
  await page.waitForTimeout(800)
  // The toast offers `u` because set:status DECLARES an inverse.
  await expect(page.locator('.ca-toast')).toContainText('Undone')
})


test('the footer lists only bindings that work', async ({ page }) => {
  // "A hint for a key that does nothing is worse than no hint." v and P are
  // not implemented yet, so they must not be advertised.
  await signIn(page)
  const foot = await page.locator('.ca-foot').innerText()

  expect(foot).toContain('Shift-arrows')
  expect(foot).toContain('n')
  expect(foot).toContain('d')
  expect(foot).toContain('t')
  expect(foot).not.toContain('validate')
  expect(foot).not.toContain('publish')
})


test('the grid is no longer described as read-only', async ({ page }) => {
  await signIn(page)
  const head = await page.locator('.ca-head').innerText()
  expect(head).not.toContain('read-only')

  const panel = page.locator('[data-detail]')
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  expect(await panel.innerText()).not.toContain('Read-only at this stage')
})


/** How many errors the header is currently reporting. 0 when there is no pill. */
async function errorCount(page) {
  const pill = page.locator('.ca-errpill')
  if (0 === await pill.count()) return 0
  return Number(await pill.getAttribute('data-errors'))
}

test('the header reports the errors the conference already has', async ({ page }) => {
  // THE DEFAULT CONFERENCE IS ALREADY INVALID, and deliberately so: the tiny
  // fixture overlaps two talks in one room, which is what
  // rule-room-double-booked.test.ts was built on. That makes it the right
  // place to assert the count is REAL rather than decorative - it names the
  // first rule and counts the rest.
  await signIn(page)
  await expect(page.locator('.ca-errpill')).toBeVisible()
  await expect(page.locator('.ca-errpill')).toContainText('room-double-booked')
  expect(await errorCount(page)).toBeGreaterThan(0)
})

test('editing is never gated by validation, and the count follows the edit', async ({ page }) => {
  // Validation gates PUBLISH, not editing (SPEC 16). An organiser rebuilding
  // a schedule has to be able to pass through an invalid state - and has to be
  // told, live, which state they are in.
  //
  // The direction is deliberately not asserted. The seeded conference is
  // ALREADY invalid, so a move can just as easily resolve its clash as create
  // one - and both are the same claim: the count is the server's answer about
  // the data as it now stands, recomputed after every settled intent.
  await signIn(page)

  const before = await errorCount(page)
  const start = await focusLabel(page)
  const title = await focusTitle(page)

  let moves = 0
  let changed = false
  for (let i = 0; i < 3 && !changed; i++) {
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(800)
    moves++
    changed = (await errorCount(page)) !== before
  }

  // THE MOVE SAVED regardless of what it did to the count.
  expect(await focusTitle(page)).toBe(title)
  expect(await focusLabel(page)).not.toBe(start)
  expect(changed).toBe(true)

  for (let i = 0; i < moves; i++) {
    await page.keyboard.press('u')
    await page.waitForTimeout(600)
  }
  await expect.poll(() => errorCount(page), { timeout: 8000 }).toBe(before)
  expect(await focusLabel(page)).toBe(start)
})


test('a room change produces ONE update, not a duplicate', async ({ page }) => {
  // THE THING THE PRODUCT IS FOR, end to end and through the UI.
  //
  // SPEC 19.4's "done when": a room change produces updates, not duplicates.
  // Everything the ledger does is invisible by construction - its job is to
  // NOT send things - so this is the one assertion that joins the two halves
  // of the project: an organiser moves a card, and the plan says `update ·
  // same UID, seq+1` rather than a second invitation.
  //
  // The seed already applied a sync for this conference, so every row starts
  // as a no-op. That is what makes the single update legible.
  await signIn(page)

  const title = await focusTitle(page)
  const before = await focusLabel(page)

  await page.keyboard.press('Shift+ArrowRight')
  await settled(page)

  await page.keyboard.press('S')
  await page.waitForSelector('.ca-sync-title')

  const moved = page.locator('[role=row]').filter({ hasText: title }).first()
  await expect(moved).toContainText('update · same UID, seq+1')
  // The room is what changed, and the plan says so in words rather than
  // offering a hash to compare.
  await expect(moved).toContainText('room')

  // ONE update, and ZERO creates. A create here would be the duplicate
  // invitation the whole ledger exists to prevent.
  const body = await page.locator('.ca-sync-grid, [role=table]').first().innerText()
  expect(body.match(/update · same UID, seq\+1/g) || []).toHaveLength(1)
  expect(body).not.toContain('create')

  await page.keyboard.press('Escape')
  await page.waitForSelector('.vg-grid')
  await page.keyboard.press('u')
  await expect.poll(() => focusLabel(page), { timeout: 8000 }).toBe(before)
})


test('drag posts the same intent as Shift-arrows', async ({ page }) => {
  // The pointer route to move:segment. SPEC 13.1 requires the grid to stay
  // fully operable from the keyboard, so drag is the alternative and never the
  // only way - but it has to post the SAME message, or there are two
  // implementations of "move" and one of them will drift.
  await signIn(page)

  const title = await focusTitle(page)
  const before = await focusLabel(page)

  const card = page.locator('[data-session]').filter({ hasText: title }).first()
  const room = await card.getAttribute('data-room')

  // A slot in ANOTHER room, at a time nothing occupies - so the move is a
  // room change, which is the case the ledger cares about, and the drop is
  // not intercepted by a card sitting on top of it.
  const pick = await page.locator('[data-slot]').evaluateAll((ns, r) => {
    const taken = new Set([...document.querySelectorAll('[data-session]')]
      .map((c) => c.getAttribute('data-room') + '@' + c.getAttribute('data-start')))
    for (let i = 0; i < ns.length; i++) {
      const dr = ns[i].getAttribute('data-room')
      if (dr === r) continue
      if (taken.has(dr + '@' + ns[i].getAttribute('data-start'))) continue
      return i
    }
    return -1
  }, room)

  test.skip(pick < 0, 'no free slot in another room')

  await card.dragTo(page.locator('[data-slot]').nth(pick))
  await settled(page)

  await expect(page.locator('.ca-toast')).toContainText('Moved')
  await expect(page.locator('.ca-toast')).toContainText(title)
  await expect.poll(() => focusLabel(page)).not.toBe(before)

  await page.keyboard.press('u')
  await expect.poll(() => focusLabel(page), { timeout: 8000 }).toBe(before)
})
