import { describe, test } from 'node:test'
import assert from 'node:assert'

const {
  ancestors, effectiveOf, topIdOf, subtreeOf, wouldCycle,
} = require('../../dist/lib/tree.js')

type N = { id: string; parent_id?: string | null; status?: string; private?: boolean }

// conf > day > (talk, break);  conf > orphanDay
const TREE: N[] = [
  { id: 'conf', parent_id: null, status: 'confirmed' },
  { id: 'day', parent_id: 'conf', status: 'confirmed' },
  { id: 'talk', parent_id: 'day', status: 'confirmed' },
  { id: 'brk', parent_id: 'day', status: 'confirmed' },
  { id: 'day2', parent_id: 'conf', status: 'draft' },
  { id: 'talk2', parent_id: 'day2', status: 'confirmed' },
]

const ids = (list: N[]) => list.map((n) => n.id)
const patch = (id: string, p: Partial<N>): N[] =>
  TREE.map((n) => (n.id === id ? { ...n, ...p } : n))

describe('tree: ancestors and top', () => {
  test('nearest-first, excluding self', () => {
    assert.deepEqual(ids(ancestors(TREE, 'talk')), ['day', 'conf'])
    assert.deepEqual(ids(ancestors(TREE, 'conf')), [])
  })

  test('top_id is the root; a top fixture is its own top', () => {
    assert.equal(topIdOf(TREE, 'talk'), 'conf')
    assert.equal(topIdOf(TREE, 'day'), 'conf')
    assert.equal(topIdOf(TREE, 'conf'), 'conf', 'a root is its own top')
  })

  test('a corrupt cycle does not hang the walk', () => {
    // Already-stored corruption: the save guard stops new cycles, but a bad
    // import can produce this and a resolver that loops takes the process out.
    const bad: N[] = [
      { id: 'a', parent_id: 'b' },
      { id: 'b', parent_id: 'a' },
    ]
    assert.deepEqual(ids(ancestors(bad, 'a')), ['b'], 'stops at the repeat')
    assert.equal(topIdOf(bad, 'a'), 'b')
  })

  test('a missing parent stops the walk and is reported', () => {
    const orphan: N[] = [{ id: 'lost', parent_id: 'gone', status: 'confirmed' }]
    assert.deepEqual(ids(ancestors(orphan, 'lost')), [])
    assert.equal(effectiveOf(orphan, 'lost').broken, true)
    assert.equal(effectiveOf(TREE, 'talk').broken, false)
  })
})

describe('tree: effective status - most restrictive wins', () => {
  test('a confirmed talk under a draft day is draft (SPEC 8)', () => {
    assert.equal(effectiveOf(TREE, 'talk2').status, 'draft')
    assert.equal(effectiveOf(TREE, 'talk').status, 'confirmed')
  })

  test('a confirmed talk under a cancelled day is cancelled', () => {
    const t = patch('day', { status: 'cancelled' })
    assert.equal(effectiveOf(t, 'talk').status, 'cancelled')
  })

  test('a cancelled talk under a draft day is DRAFT, not cancelled', () => {
    // draft is more restrictive than cancelled: cancelled is still published
    // (marked cancelled, keeps its slot, SPEC 9.1) whereas draft is not
    // published at all. So the day being unfinished wins.
    const t = patch('talk', { status: 'cancelled' })
    const t2 = t.map((n) => (n.id === 'day' ? { ...n, status: 'draft' } : n))
    assert.equal(effectiveOf(t2, 'talk').status, 'draft')
  })

  test('an unknown status is treated as the most restrictive', () => {
    // A typo should hide a session, never publish one by accident.
    const t = patch('talk', { status: 'confrimed' })
    assert.equal(effectiveOf(t, 'talk').status, 'draft')
  })

  test('privacy is inherited by any private ancestor', () => {
    assert.equal(effectiveOf(TREE, 'talk').private, false)
    const t = patch('conf', { private: true })
    assert.equal(effectiveOf(t, 'talk').private, true, 'private at the root reaches the leaf')
    const t2 = patch('day', { private: true })
    assert.equal(effectiveOf(t2, 'brk').private, true)
    assert.equal(effectiveOf(t2, 'talk2').private, false, 'a sibling branch is unaffected')
  })

  test('an unknown fixture resolves closed, not open', () => {
    const e = effectiveOf(TREE, 'nope')
    assert.equal(e.status, 'draft')
    assert.equal(e.private, true, 'unknown must never resolve to public')
    assert.equal(e.broken, true)
  })
})

describe('tree: subtree and the cycle guard', () => {
  test('subtree is every descendant, excluding self', () => {
    assert.deepEqual(ids(subtreeOf(TREE, 'day')).sort(), ['brk', 'talk'])
    assert.deepEqual(ids(subtreeOf(TREE, 'conf')).sort(), ['brk', 'day', 'day2', 'talk', 'talk2'])
    assert.deepEqual(subtreeOf(TREE, 'talk'), [], 'a leaf has none')
  })

  test('subtree order is deterministic regardless of input order', () => {
    const a = JSON.stringify(ids(subtreeOf(TREE, 'conf')))
    const b = JSON.stringify(ids(subtreeOf(TREE.slice().reverse(), 'conf')))
    assert.equal(a, b)
  })

  test('rejects a self-parent and a descendant-parent', () => {
    assert.equal(wouldCycle(TREE, 'day', 'day'), true, 'own parent')
    assert.equal(wouldCycle(TREE, 'day', 'talk'), true, 'child as parent')
    assert.equal(wouldCycle(TREE, 'conf', 'talk'), true, 'deep descendant as parent')
  })

  test('allows legitimate re-parenting', () => {
    assert.equal(wouldCycle(TREE, 'talk', 'day2'), false, 'move to a sibling day')
    assert.equal(wouldCycle(TREE, 'talk', 'conf'), false, 'promote to the top')
    assert.equal(wouldCycle(TREE, 'day', null), false, 'detach to a root')
    assert.equal(wouldCycle(TREE, 'day', undefined), false)
  })
})
