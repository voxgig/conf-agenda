import {
  principalOf, validCanon, scopeOf, ownerOf, asOwner, asSystem, publicUser,
} from './access'

// aim:ent,cmd:load  { ent:'zone/name', id }
//
// A load addresses a row by id, so which project it belongs to is not
// known from the message. Resolve that first (system read), then re-load
// as the caller so @seneca/owner is the thing that actually decides - a
// row outside the caller's project comes back null.
module.exports = function make_cmd_load() {
  return async function cmd_load(this: any, msg: any, meta: any) {
    const seneca = this
    const model = seneca.context.model
    const canon = String(msg.ent || '')
    if (!validCanon(model, canon)) {
      return { ok: false, why: 'unknown-entity' }
    }
    const user = principalOf(meta)
    if (!user) {
      return { ok: false, why: 'not-authenticated' }
    }

    const scope = scopeOf(model, canon)

    // sys/user: public projection, not project data.
    if ('open' === scope.kind) {
      const item = await asSystem(seneca).entity(canon).load$(msg.id)
      return { ok: true, item: publicUser(item) }
    }

    const found = await asSystem(seneca).entity(canon).load$(msg.id)
    if (!found) {
      return { ok: true, item: null }
    }

    const projectId = 'project' === scope.kind
      ? found.id
      : found[(scope as any).via]

    // A scoped row with no stored tenant is an anomaly, not user-scoped
    // data - refuse it rather than let ownerOf downgrade to owner-only.
    if ('scoped' === scope.kind && null == projectId) {
      return { ok: false, why: 'forbidden' }
    }

    const owner = await ownerOf(seneca, user, projectId)
    if (null == owner) {
      return { ok: false, why: 'forbidden' }
    }

    const item = await asOwner(seneca, owner).entity(canon).load$(msg.id)
    return null == item ? { ok: false, why: 'forbidden' } : { ok: true, item }
  }
}
