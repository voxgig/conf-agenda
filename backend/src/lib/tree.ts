/* Fixture-tree algebra. The logic behind `concern:fixture,*`.
 *
 * Pure functions over a set of nodes - no store, no bus. The concern
 * (src/concern/FixtureTree) loads rows and calls these; services call the
 * concern, never these directly (PLATFORM 1.5).
 *
 * Every walk here is CYCLE-SAFE. The save-time guard stops new cycles from
 * being stored, but data can already be corrupt - a bad import, a row written
 * before the guard existed - and a resolver that loops forever on it takes the
 * process with it.
 */

export type TreeNode = {
  id: string
  parent_id?: string | null
  status?: string
  private?: boolean
}

export type Effective = {
  status: string
  private: boolean
  /** Ancestor chain used, nearest-first, excluding the node itself. */
  chain: string[]
  /** True when the chain hit a parent_id that no node carries. */
  broken: boolean
}

/**
 * Status by RESTRICTIVENESS, most restrictive last. Most restrictive wins
 * down the tree (SPEC 8).
 *
 * The ordering is driven by what each status does to public output:
 *   confirmed - published normally
 *   cancelled - published, marked cancelled, keeps its slot (SPEC 9.1)
 *   draft     - not published at all
 *
 * So `draft` is MORE restrictive than `cancelled`: a cancelled talk under a
 * draft day is draft, because the day was never published in the first place.
 * SPEC 8 gives one example - "a confirmed talk under a draft day is
 * effectively draft" - and leaves the rest implicit; this is that rule
 * completed, with the reasoning stated so it can be argued with.
 */
const RANK: Record<string, number> = {
  confirmed: 0,
  cancelled: 1,
  draft: 2,
}

const DEFAULT_STATUS = 'draft'

function rankOf(status?: string): number {
  const s = status ?? DEFAULT_STATUS
  // An unknown status is treated as the most restrictive thing we know, so a
  // typo hides a session rather than publishing it by accident.
  return s in RANK ? RANK[s] : RANK[DEFAULT_STATUS]
}

function statusOfRank(rank: number): string {
  for (const [k, v] of Object.entries(RANK)) if (v === rank) return k
  return DEFAULT_STATUS
}

export function indexById(nodes: TreeNode[]): Map<string, TreeNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

/**
 * The ancestor chain, nearest-first, excluding the node itself. Stops on a
 * missing parent, and stops on a repeat - so a corrupt cycle yields a finite
 * chain instead of hanging.
 */
export function ancestors(nodes: TreeNode[], id: string): TreeNode[] {
  const by = indexById(nodes)
  const out: TreeNode[] = []
  const seen = new Set<string>([id])

  let cur = by.get(id)
  while (cur && null != cur.parent_id && '' !== cur.parent_id) {
    if (seen.has(cur.parent_id)) break
    const parent = by.get(cur.parent_id)
    if (!parent) break
    out.push(parent)
    seen.add(parent.id)
    cur = parent
  }
  return out
}

/** Effective status and privacy, resolved along the ancestor chain. */
export function effectiveOf(nodes: TreeNode[], id: string): Effective {
  const by = indexById(nodes)
  const self = by.get(id)
  if (!self) {
    return { status: DEFAULT_STATUS, private: true, chain: [], broken: true }
  }

  const chain = ancestors(nodes, id)

  let rank = rankOf(self.status)
  let priv = true === self.private

  for (const a of chain) {
    const r = rankOf(a.status)
    if (r > rank) rank = r
    if (true === a.private) priv = true
  }

  // A chain that ends at a node still naming a parent is broken: the parent
  // row is missing. Report it rather than silently treating the node as a
  // root - `unknown-reference` (SPEC 16.1) is the rule that surfaces it.
  const last = 0 === chain.length ? self : chain[chain.length - 1]
  const broken = null != last.parent_id && '' !== last.parent_id

  return { status: statusOfRank(rank), private: priv, chain: chain.map((a) => a.id), broken }
}

/**
 * The root of this node's tree - `top_id`. A top fixture is its own top,
 * matching fixture-srv, where a segment inherits its parent's top_fixture_id
 * or takes the parent's own id when the parent is top.
 */
export function topIdOf(nodes: TreeNode[], id: string): string {
  const chain = ancestors(nodes, id)
  return 0 === chain.length ? id : chain[chain.length - 1].id
}

/** Every descendant of `id`, excluding the node itself. Breadth-first, stable. */
export function subtreeOf(nodes: TreeNode[], id: string): TreeNode[] {
  const kids = new Map<string, TreeNode[]>()
  for (const n of nodes) {
    if (null == n.parent_id || '' === n.parent_id) continue
    const list = kids.get(n.parent_id) ?? []
    list.push(n)
    kids.set(n.parent_id, list)
  }
  for (const list of kids.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const out: TreeNode[] = []
  const seen = new Set<string>([id])
  const queue = [...(kids.get(id) ?? [])]

  while (0 < queue.length) {
    const n = queue.shift() as TreeNode
    if (seen.has(n.id)) continue // corrupt cycle - do not revisit
    seen.add(n.id)
    out.push(n)
    queue.push(...(kids.get(n.id) ?? []))
  }
  return out
}

/**
 * Would setting `id`'s parent to `newParentId` create a cycle?
 *
 * The runtime pair of the ontology's `contains: acyclic` (SPEC 8.2), which
 * only checks at build. Called BEFORE storing: after storing, every tree
 * resolver and clone:fixture would recurse forever.
 */
export function wouldCycle(nodes: TreeNode[], id: string, newParentId?: string | null): boolean {
  if (null == newParentId || '' === newParentId) return false
  if (newParentId === id) return true // a node cannot be its own parent

  // A cycle forms exactly when the proposed parent is the node itself or one
  // of its descendants.
  return subtreeOf(nodes, id).some((n) => n.id === newParentId)
}
