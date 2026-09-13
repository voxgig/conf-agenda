// Access control support for the generic entity service.
//
// Enforcement itself lives in @seneca/owner (configured in
// src/env/shared/basic.ts), which scopes every entity message by the two
// ownership axes it finds on `custom.sysowner`:
//
//   owner_id   the acting user
//   project_id the project in play (the tenant axis)
//
// This module's job is only to RESOLVE those axes from the gateway
// principal and the message, and to say which canons the service will
// answer for at all. It does not filter rows - the entity layer does.
//
// Relationships in the model are reference fields: `kind: String` plus a
// `ref: 'zone/name'` attribute (never `kind: 'Ref'`).

import { base } from '../../env/shared/basic'

// The ownership axes @seneca/owner manages. They are SERVER-managed: a
// client may neither set them nor round-trip them back on update (a loaded
// row carries them, and owner rejects a create/update whose payload
// disagrees with the acting owner - see stripOwned).
export const OWNER_FIELDS: string[] = base.options.owner.fields

// @seneca/owner fails writes loudly rather than returning an empty result,
// so a denial arrives as an error, not a null.
const DENIED = [
  'create-not-allowed',
  'update-not-allowed',
  'save-not-found',
  'role-entity-not-allowed',
]

export function isDenied(err: any): boolean {
  return !!err && DENIED.indexOf(err.code) >= 0
}

// Drop the server-managed ownership fields from client data, so owner
// injects them from custom.sysowner instead of comparing them to a claim.
export function stripOwned(data: any): any {
  for (const f of OWNER_FIELDS) {
    delete data[f]
  }
  return data
}

export type Scope =
  | { kind: 'project' }
  | { kind: 'scoped'; via: string }
  | { kind: 'user' }
  | { kind: 'open' }

export function principalOf(meta: any): any {
  return (meta && meta.custom && meta.custom.principal && meta.custom.principal.user) || null
}

export function entDef(model: any, canon: string): any {
  const [zone, name] = String(canon).split('/')
  return model && model.main && model.main.ent &&
    model.main.ent[zone] && model.main.ent[zone][name] || null
}

export function validCanon(model: any, canon: string): boolean {
  if (!entDef(model, canon)) {
    return false
  }
  const zone = String(canon).split('/')[0]
  // Only sys/user is reachable from the sys zone (for pickers); sys/login etc. are not.
  return 'sys' !== zone || 'sys/user' === canon
}

// Find the reference field that targets proj/project, if any.
function projectRefField(model: any, canon: string): string | null {
  const def = entDef(model, canon)
  const fields = (def && def.field) || {}
  for (const fname of Object.keys(fields)) {
    const f = fields[fname]
    if (f && 'proj/project' === f.ref) {
      return fname
    }
  }
  return null
}

export function scopeOf(model: any, canon: string): Scope {
  if ('proj/project' === canon) {
    return { kind: 'project' }
  }
  if ('sys/user' === canon) {
    return { kind: 'open' }
  }
  const via = projectRefField(model, canon)
  if (via) {
    return { kind: 'scoped', via }
  }
  return { kind: 'user' }
}

// Project ids the given user is a member of.
export async function myProjectIds(seneca: any, userId: string): Promise<string[]> {
  if (!userId) {
    return []
  }
  const members = await seneca.entity('proj/member').list$({ user_id: userId })
  const ids: string[] = []
  for (const m of members) {
    if (null != m.project_id && ids.indexOf(m.project_id) < 0) {
      ids.push(m.project_id)
    }
  }
  return ids
}

export async function isMember(seneca: any, userId: string, projectId: string): Promise<boolean> {
  if (!userId || null == projectId) {
    return false
  }
  const m = await seneca.entity('proj/member').load$({ user_id: userId, project_id: projectId })
  return !!m
}

// The project this message acts in, taken from the message itself: the
// query filter for a list, the item's project ref for a save, else null
// (load/remove address a row by id and are resolved by the caller).
export function projectOf(model: any, canon: string, msg: any): string | null {
  const scope = scopeOf(model, canon)
  if ('scoped' !== scope.kind) {
    return null
  }
  const via = (scope as any).via
  const q = msg.q || {}
  const item = msg.item || {}
  return null != q[via] ? q[via] : (null != item[via] ? item[via] : null)
}

// The @seneca/owner axes for a user acting in a project. Pure: use it
// only where membership is ALREADY established (project ids that came
// out of the member table). Everywhere else use ownerOf.
export function ownerFor(user: any, projectId: string | null): any {
  // No project in play -> owner-only scoping (the `user` role).
  return null == projectId
    ? { owner_id: user.id, role: 'user' }
    : { owner_id: user.id, project_id: projectId, role: 'member' }
}

// Same, but confirms membership first. Returns null when the caller is
// not a member of the requested project, which the caller turns into
// 'forbidden' - owner would deny the row anyway, this just gives a
// precise reason instead of an empty result.
export async function ownerOf(
  seneca: any, user: any, projectId: string | null
): Promise<any> {
  if (null == projectId) {
    return ownerFor(user, null)
  }
  if (!(await isMember(seneca, user.id, projectId))) {
    return null
  }
  return ownerFor(user, projectId)
}

// Run entity operations as the given owner: a delegate carrying
// custom.sysowner, which is where @seneca/owner reads the axes from.
export function asOwner(seneca: any, owner: any): any {
  return seneca.delegate(null, { custom: { sysowner: owner } })
}

// Internal, unscoped access for bookkeeping the caller is not the owner of
// (membership rows, discovering which project a row belongs to). Never
// derived from request input - see the `system` role in basic.ts.
export function asSystem(seneca: any): any {
  return asOwner(seneca, { owner_id: 'system', role: 'system' })
}

// Public projection of a user (never expose password/hashes).
export function publicUser(u: any): any {
  return u ? { id: u.id, name: u.name, email: u.email, handle: u.handle } : u
}
