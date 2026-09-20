/* buildInverse: the one piece of undo with logic in it (PLATFORM 1.4).
 *
 * web/ had no unit runner - package.json carried only playwright - which is
 * why buildInverse is written as a PURE function over (definition, params,
 * result). Everything it can get wrong is cheap to assert here and expensive
 * to discover through a browser.
 *
 * Run with `npm test` in web/.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { buildInverse, webMessage, makeUndoStack } from '../src/undo.js'

const MOVE = {
  pat: [{ aim: 'cag' }, { move: 'segment' }],
  inverse: {
    pat: [{ aim: 'cag' }, { move: 'segment' }],
    map: {
      fixture_id: 'params.fixture_id',
      room_id: 'result.prev.room_id',
      t_start: 'result.prev.t_start',
    },
  },
}

const DECLARED = ['aim:cag,move:segment', 'aim:web,on:cag,move:segment']


describe('buildInverse', () => {
  test('resolves params.* and result.prev.*, as an aim:web message', () => {
    const out = buildInverse(
      MOVE,
      { fixture_id: 'seg_buses', room_id: 'room_b', t_start: 2000 },
      { ok: true, prev: { room_id: 'room_a', t_start: 1000 } },
      DECLARED,
    )
    // THE BROWSER MAY ONLY POST aim:web. inverse.pat names the SERVICE
    // pattern, so an undo that posted it verbatim would have no client route
    // and would fail silently the first time somebody pressed `u`.
    assert.deepEqual(out, {
      aim: 'web', on: 'cag', move: 'segment',
      fixture_id: 'seg_buses', room_id: 'room_a', t_start: 1000,
    })
  })

  test('a definition with no inverse is NOT undoable', () => {
    // PLATFORM 1.4: "a definition without `inverse` is not undoable, and the
    // UI must show it that way". null is how the UI is told.
    assert.equal(buildInverse({ pat: [{ aim: 'cag' }, { remove: 'segment' }] }, {}, {}), null)
    assert.equal(buildInverse(null, {}, {}), null)
  })

  test('an inverse with no declared proxy is refused, not guessed', () => {
    assert.equal(
      buildInverse(MOVE, { fixture_id: 'x' }, { prev: { room_id: 'r', t_start: 1 } },
        ['aim:cag,move:segment']),
      null,
      'built an undo the browser cannot post',
    )
  })

  test('a missing mapped value refuses rather than posting a half-built edit', () => {
    // The action stopped returning something its own contract names. Sending
    // `room_id: undefined` would move the session to no room at all.
    assert.equal(
      buildInverse(MOVE, { fixture_id: 'x' }, { ok: true, prev: { room_id: 'r' } }, DECLARED),
      null,
    )
    assert.equal(buildInverse(MOVE, { fixture_id: 'x' }, { ok: true }, DECLARED), null)
  })

  test('a falsy value is still a value', () => {
    // t_start: 0 is a real instant, and '' is a real "no room". Testing
    // truthiness rather than undefined would silently drop both.
    const out = buildInverse(
      MOVE,
      { fixture_id: 'x' },
      { ok: true, prev: { room_id: '', t_start: 0 } },
      DECLARED,
    )
    assert.deepEqual(out, {
      aim: 'web', on: 'cag', move: 'segment', fixture_id: 'x', room_id: '', t_start: 0,
    })
  })
})


describe('webMessage', () => {
  test('translates a service pattern into the proxy the gateway accepts', () => {
    assert.deepEqual(webMessage('aim:cag,move:segment'),
      { aim: 'web', on: 'cag', move: 'segment' })
  })

  test('refuses anything that is not an aim: pattern', () => {
    assert.equal(webMessage('sys:calendar,send:invite'), null)
    assert.equal(webMessage('aim:cag'), null)
  })
})


describe('the undo stack', () => {
  const ok = async () => ({ ok: true })
  const fail = async () => ({ ok: false, why: 'not-found' })

  test('pops in reverse order', async () => {
    const s = makeUndoStack()
    s.push({ a: 1 }, 'first')
    s.push({ a: 2 }, 'second')
    assert.equal((await s.pop(ok)).label, 'second')
    assert.equal((await s.pop(ok)).label, 'first')
    assert.equal(s.depth, 0)
  })

  test('a failed undo leaves the entry in place', async () => {
    // The edit is still there to undo. Discarding it would strand the
    // organiser one step further from where they wanted to be.
    const s = makeUndoStack()
    s.push({ a: 1 }, 'move')
    const out = await s.pop(fail)
    assert.equal(out.ok, false)
    assert.equal(out.why, 'not-found')
    assert.equal(s.depth, 1)
  })

  test('nothing is pushed while an undo is running', async () => {
    // Or `u` becomes a two-state flip-flop rather than a stack walk.
    const s = makeUndoStack()
    s.push({ a: 1 }, 'first')
    await s.pop(async () => {
      assert.equal(s.applying, true)
      assert.equal(s.push({ a: 99 }, 'inverse of the inverse'), false)
      return { ok: true }
    })
    assert.equal(s.depth, 0)
  })

  test('an empty stack refuses rather than throwing', async () => {
    const s = makeUndoStack()
    assert.equal((await s.pop(ok)).why, 'nothing-to-undo')
  })

  test('clear drops everything', () => {
    // Principal- AND fixture-scoped: a stale `u` after a sign-in as somebody
    // else posts an edit against a row nobody is looking at.
    const s = makeUndoStack()
    s.push({ a: 1 }, 'x')
    s.clear()
    assert.equal(s.depth, 0)
    assert.equal(s.peek(), null)
  })

  test('the stack is bounded', () => {
    const s = makeUndoStack(3)
    for (let i = 0; i < 10; i++) s.push({ i }, 'e' + i)
    assert.equal(s.depth, 3)
    assert.equal(s.peek().label, 'e9')
  })
})
