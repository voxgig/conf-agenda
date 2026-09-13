import {
  principalOf, validCanon, scopeOf, myProjectIds, ownerFor, asOwner, asSystem,
  publicUser,
} from './access'

// aim:ent,cmd:list  { ent:'zone/name', q?:{...} }
//
// Rows are filtered by @seneca/owner, not here: each list runs on a
// delegate whose custom.sysowner names the project, and owner refines the
// query by the tenant axis. The membership JOIN is the one thing owner
// cannot express (it scopes to ONE tenant, not "every project I belong
// to"), so listing across projects fans out over the member rows.
module.exports = function make_cmd_list() {
  return async function cmd_list(this: any, msg: any, meta: any) {
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
    const q = Object.assign({}, msg.q)

    // sys/user: public projection, for reference pickers.
    if ('open' === scope.kind) {
      const list = await asSystem(seneca).entity(canon).list$(q)
      return { ok: true, list: list.map(publicUser) }
    }

    // Not project data: owner scopes it to the acting user alone.
    if ('user' === scope.kind) {
      const owner = ownerFor(user, null)
      return { ok: true, list: await asOwner(seneca, owner).entity(canon).list$(q) }
    }

    // Every id below came OUT of the member table, so membership is
    // already established - ownerFor, not ownerOf, or each one costs a
    // redundant round trip re-proving what this list just read.
    const myIds = await myProjectIds(seneca, user.id)

    // The projects themselves: one load per membership row.
    if ('project' === scope.kind) {
      const projects: any[] = []
      for (const id of myIds) {
        const p = await asOwner(seneca, ownerFor(user, id)).entity(canon).load$(id)
        if (p && matches(p, q)) {
          projects.push(p)
        }
      }
      return { ok: true, list: projects }
    }

    // 'scoped': one project asked for, or a union across all of mine.
    const via = (scope as any).via
    const ids = null != q[via] ? [q[via]] : myIds
    if (null != q[via] && myIds.indexOf(q[via]) < 0) {
      return { ok: false, why: 'forbidden' }
    }

    let all: any[] = []
    for (const pid of ids) {
      const sub = Object.assign({}, q)
      sub[via] = pid
      all = all.concat(
        await asOwner(seneca, ownerFor(user, pid)).entity(canon).list$(sub))
    }
    return { ok: true, list: all }
  }
}

// Simple exact-match filter (the membership-scoped project list is loaded
// by id, so the query can't go through list$).
function matches(item: any, q: any) {
  for (const k of Object.keys(q || {})) {
    if (item[k] !== q[k]) {
      return false
    }
  }
  return true
}
