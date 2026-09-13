/* FixtureTree - the `concern:fixture,*` concern.
 *
 * Shared business logic several services need identically (PLATFORM 1.5):
 * ancestor walks, effective status and visibility, top_id maintenance, the
 * save-time cycle guard, and subtree enumerate-and-act.
 *
 * A concern is an ordinary Seneca plugin, not a service: no `aim:` surface, so
 * it is never reachable from the gateway or the API. Services call it through
 * the bus and never reimplement it. SPEC 22 names an inline copy of a
 * concern's rule as one of the two most common failures on this stack - the
 * copy passes its own tests and diverges the first time either changes.
 *
 * The tree algebra itself is pure and lives in src/lib/tree.ts; this plugin is
 * the seam between it and the entity store.
 */

import {
  ancestors,
  effectiveOf,
  subtreeOf,
  topIdOf,
  wouldCycle,
  TreeNode,
} from '../../lib/tree'

const CANON = 'cag/fixture'

type Options = {
  canon: string
}

const defaults: Options = {
  canon: CANON,
}

function FixtureTree(this: any, options: Options) {
  const seneca: any = this
  const canon = options.canon

  /**
   * Load the candidate node set for one fixture's tree.
   *
   * Scoped to the fixture's own org: a tree never spans tenants
   * (`cross-tenant-reference` is an error, SPEC 16.1), so the org is a correct
   * and cheap boundary. It is still a whole-org load per call - fine at this
   * scale, and the place to add a top_id-scoped query when a real programme
   * makes it matter.
   */
  async function loadNodes(this: any, fixture_id: string): Promise<{
    nodes: TreeNode[]
    self: any
  }> {
    const self = await this.entity(canon).load$(fixture_id)
    if (null == self) return { nodes: [], self: null }

    const q: any = {}
    if (null != self.org_id) q.org_id = self.org_id

    const list = await this.entity(canon).list$(q)
    return { nodes: list.map((r: any) => r.data$(false)) as TreeNode[], self }
  }

  seneca
    .fix('concern:fixture')

    // Effective status and privacy, resolved along the ancestor chain, most
    // restrictive wins (SPEC 8). Publication, the feeds and calendar
    // eligibility all consume THIS, never a node's own fields - otherwise one
    // confirmed child under an unfinished day leaks into public output.
    .message('resolve:effective', { fixture_id: String }, async function (
      this: any,
      msg: any,
    ) {
      const { nodes, self } = await loadNodes.call(this, msg.fixture_id)
      if (null == self) return { ok: false, why: 'not-found' }

      const eff = effectiveOf(nodes, msg.fixture_id)
      return { ok: true, ...eff }
    })

    // The whole tree under one fixture, with effective values already
    // resolved - ONE store load for the lot. Resolving per segment would be a
    // whole-org load each, which is O(n^2) rows for a real programme; SPEC 17
    // budgets a 200-session conference at under 500ms.
    .message('resolve:tree', { fixture_id: String }, async function (this: any, msg: any) {
      const { nodes, self } = await loadNodes.call(this, msg.fixture_id)
      if (null == self) return { ok: false, why: 'not-found' }

      const wanted = [
        nodes.find((n) => n.id === msg.fixture_id) as TreeNode,
        ...subtreeOf(nodes, msg.fixture_id),
      ]

      const resolved = wanted.map((n) => {
        const eff = effectiveOf(nodes, n.id)
        return {
          ...(nodes.find((x) => x.id === n.id) as any),
          effective_status: eff.status,
          effective_private: eff.private,
          broken_chain: eff.broken,
        }
      })

      return { ok: true, top_id: topIdOf(nodes, msg.fixture_id), nodes: resolved }
    })

    .message('list:ancestors', { fixture_id: String }, async function (this: any, msg: any) {
      const { nodes, self } = await loadNodes.call(this, msg.fixture_id)
      if (null == self) return { ok: false, why: 'not-found' }

      return { ok: true, list: ancestors(nodes, msg.fixture_id) }
    })

    // top_id is server-managed - the client never sets it (fixture-srv made
    // this explicit with `top_fixture_id: Joi.forbidden()`).
    .message('resolve:top', { fixture_id: String }, async function (this: any, msg: any) {
      const { nodes, self } = await loadNodes.call(this, msg.fixture_id)
      if (null == self) return { ok: false, why: 'not-found' }

      return { ok: true, top_id: topIdOf(nodes, msg.fixture_id) }
    })

    // Every descendant, for enumerate-and-act. C8 needs this: deleting a
    // fixture first cancels the provider events of its WHOLE subtree - cancel,
    // then delete, the irreversible step last - so deleting an intermediate
    // day never strands its talks' calendar events.
    .message('list:subtree', { fixture_id: String }, async function (this: any, msg: any) {
      const { nodes, self } = await loadNodes.call(this, msg.fixture_id)
      if (null == self) return { ok: false, why: 'not-found' }

      return { ok: true, list: subtreeOf(nodes, msg.fixture_id) }
    })

    // The save-time cycle guard: the runtime pair of the ontology's
    // `contains: acyclic`, which only checks the model and vetted data at
    // build (SPEC 8.2). Call this BEFORE storing a changed parent_id - after
    // storing, every tree resolver and clone:fixture recurses forever.
    .message(
      'check:cycle',
      { fixture_id: String, parent_id: seneca.valid.Skip(String) },
      async function (this: any, msg: any) {
        const { nodes, self } = await loadNodes.call(this, msg.fixture_id)
        if (null == self) return { ok: false, why: 'not-found' }

        const cycle = wouldCycle(nodes, msg.fixture_id, msg.parent_id)
        return {
          ok: !cycle,
          cycle,
          ...(cycle ? { why: 'fixture-cycle' } : {}),
        }
      },
    )

  return { name: 'FixtureTree' }
}

Object.assign(FixtureTree, { defaults })

export default FixtureTree
export { FixtureTree }

if ('undefined' !== typeof module) {
  module.exports = FixtureTree
}
