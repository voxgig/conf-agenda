import {
  principalOf, validCanon, scopeOf, ownerOf, asOwner, asSystem,
} from './access'

// aim:ent,cmd:remove  { ent:'zone/name', id }
//
// Same shape as cmd_load: discover the row's project, then delete as the
// caller so @seneca/owner refines the query - a row outside the caller's
// project is simply not matched.
module.exports = function make_cmd_remove() {
  return async function cmd_remove(this: any, msg: any, meta: any) {
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
    if ('open' === scope.kind) {
      return { ok: false, why: 'read-only' }
    }

    const found = await asSystem(seneca).entity(canon).load$(msg.id)
    if (!found) {
      return { ok: true }
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

    // Owner treats a denied remove as a silent no-op, which would report
    // success for a row the caller cannot see. Read it back as the caller
    // first, so remove answers like load does.
    const mine = asOwner(seneca, owner).entity(canon)
    if (null == await mine.load$(msg.id)) {
      return { ok: false, why: 'forbidden' }
    }

    await mine.remove$(msg.id)
    return { ok: true }
  }
}
