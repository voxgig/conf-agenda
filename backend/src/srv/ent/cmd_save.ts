import {
  principalOf, validCanon, scopeOf, projectOf, ownerOf, asOwner, asSystem,
  stripOwned, isDenied, OWNER_FIELDS,
} from './access'

// aim:ent,cmd:save  { ent:'zone/name', item:{...} }
//
// Create or update. Row-level access is NOT enforced here: the save runs on
// a delegate carrying custom.sysowner, and @seneca/owner injects the
// ownership axes on create and refines the query on update - so an update
// naming a row outside the caller's project simply does not find it.
// Timestamps (t_c/t_m) are maintained by @seneca/entity-util.
//
// What this action must get right is WHICH TENANT the save acts in. On
// create the payload names it (there is no row to contradict). On update
// the tenant is read from the STORED row, and the payload's project field
// is pinned to it. Taking the tenant from the payload would let a caller
// name a project they DO belong to, pass the membership check, and have
// owner refine the query by that same project - overwriting someone else's
// row. This surface therefore does not move rows between projects.
module.exports = function make_cmd_save() {
  return async function cmd_save(this: any, msg: any, meta: any) {
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

    const data = Object.assign({}, msg.item)

    // An id naming no existing row is a create with a client-chosen id, not
    // an update: there is no stored tenant, and nothing to hijack.
    const found = null == data.id
      ? null
      : await asSystem(seneca).entity(canon).load$(data.id)

    let projectId: string | null = null

    if (null == found) {
      projectId = projectOf(model, canon, msg)
      if ('scoped' === scope.kind && null == projectId) {
        return { ok: false, why: 'project-required' }
      }

      // A client-chosen id must move to `id$`. @seneca/owner takes the
      // create path only when ent.id is null - with a plain id it treats
      // the save as an update, finds no row, and fails save-not-found.
      // `id$` is seneca-entity's "create with this id", so the row still
      // goes through owner's create path and gets its axes injected.
      if (null != data.id) {
        data.id$ = data.id
        delete data.id
      }
    }
    else if ('project' === scope.kind) {
      // The project IS the tenant, so updating one acts within itself.
      projectId = found.id
    }
    else if ('scoped' === scope.kind) {
      const via = (scope as any).via
      projectId = found[via]

      // A scoped row with no stored tenant is an anomaly (orphaned or
      // legacy data), NOT user-scoped data. Refuse it rather than let
      // ownerOf fall back to owner-only scoping, which would hand its
      // creator access outside any project.
      if (null == projectId) {
        return { ok: false, why: 'forbidden' }
      }

      // Pin the tenant to the stored row. `via` is whatever field the
      // model points at proj/project, so it is NOT necessarily one of the
      // owner fields stripOwned removes - overwrite it explicitly, or a
      // model naming it anything but project_id lets the payload move the
      // row to another project.
      data[via] = projectId
    }

    const owner = await ownerOf(seneca, user, projectId)
    if (null == owner) {
      return { ok: false, why: 'forbidden' }
    }

    // The ownership axes come from the delegate, never the payload - a row
    // loaded by the client carries them, and re-sending them unchanged
    // would otherwise be read as a claim.
    stripOwned(data)

    // An update keeps the row's STORED ownership. stripOwned has just
    // removed the client's copy, and owner injects any axis it finds
    // null - so without this, one member editing another member's row
    // silently transfers its owner_id to the editor (the `member` role
    // relaxes writes on that axis, so the plugin raises no objection).
    if (null != found) {
      for (const f of OWNER_FIELDS) {
        if (null != found[f]) {
          data[f] = found[f]
        }
      }
    }

    let item: any
    try {
      item = await asOwner(seneca, owner).entity(canon).data$(data).save$()
    }
    catch (err: any) {
      if (isDenied(err)) {
        return { ok: false, why: 'forbidden' }
      }
      throw err
    }
    if (null == item) {
      return { ok: false, why: 'forbidden' }
    }

    // Creating a project makes the creator its first (owner) member. This
    // is bookkeeping for a project the caller is not yet a member of, so
    // it cannot run as `member` - see the `system` role in basic.ts.
    if ('project' === scope.kind && null == found) {
      await asSystem(seneca).entity('proj/member').data$({
        project_id: item.id,
        user_id: user.id,
        role: 'owner',
        owner_id: user.id,
      }).save$()
    }

    return { ok: true, item }
  }
}
