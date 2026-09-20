//// Shared machinery for the segment intents (SPEC 9).
////
//// Every mutation on the browser surface is a NAMED INTENT with a closed
//// shape. The browser never composes an entity and never computes the new
//// row - the result of a drag is an intent, not a payload (PLATFORM 1.2).
//// What follows is what all of them have to do in the same order, in one
//// place, so a new intent inherits it rather than reimplementing it.
////
//// TENANCY COMES FROM THE STORED ROW. None of the intents declares an
//// org_id in its `params` at all, so there is no key to send - the closed
//// shape is the structural half, and reading the loaded row is the other.
//// Taking it from the payload lets a caller name a tenant they belong to,
//// pass the membership check, and overwrite a row in someone else's. That
//// was a real flaw in todo-app (PLATFORM 1.2), and SPEC 13.2 says plainly:
//// do not reintroduce it.

import { crossTenant } from '../../lib/validate/references'
import { parentKindVerdict } from '../../lib/validate/tree_shape'

export type IntentOut = {
  ok: boolean
  why?: string
  /** The stored row after the change. */
  item?: any
  /** Exactly the fields this intent's declared `inverse` map reads. */
  prev?: any
  /** Set by the creating intents, whose inverse maps from `result.*`. */
  fixture_id?: string
  appearance_id?: string
}

/** The canon each reference field points at. */
const REF_CANON: Record<string, string> = {
  parent_id: 'cag/fixture',
  room_id: 'cag/room',
  track_id: 'cag/track',
  speaker_id: 'cag/speaker',
}

/**
 * The server clock, injectable - so a test is not a race and two runs over
 * identical data agree (SPEC 17). Same idiom as publish_fixture.
 */
export function nowOf(seneca: any): number {
  return seneca.context && seneca.context.now ? seneca.context.now() : Date.now()
}

/** Stable key order, so two identical reads serialise identically (SPEC 17). */
export function tidy(row: any): any {
  if (null == row) return null
  const out: any = {}
  for (const k of Object.keys(row).sort()) out[k] = row[k]
  return out
}

/** Exactly the keys named, and nothing else - the `prev` an inverse reads. */
export function pick(row: any, keys: string[]): any {
  const out: any = {}
  for (const k of keys) out[k] = null == row ? null : row[k]
  return out
}

/**
 * Load a row, or the refusal to return. Returns the ENTITY (not plain data),
 * because an update has to save it back - `id$` only ever creates, so saving
 * an existing id that way is `entity-id-exists`.
 */
export async function loadRow(seneca: any, canon: string, id: any): Promise<any> {
  if (null == id || '' === id) return null
  return seneca.entity(canon).load$(String(id))
}

/**
 * Refuse a reference that leaves the owning row's organisation.
 *
 * SPEC 16.1 requires cross-tenant-reference "at save time as well as at
 * validate", and this is that save time. Existence is not enough: a user with
 * access to two orgs must not be able to graft one org's tree onto another's
 * room. The comparison itself is the validator's (`crossTenant`), so the rule
 * has one definition.
 *
 * Returns a `why` code, or null when every reference is clean.
 */
export async function checkRefs(
  seneca: any, owner: any, changes: Record<string, any>,
): Promise<string | null> {
  for (const field of Object.keys(changes)) {
    const canon = REF_CANON[field]
    const id = changes[field]
    if (null == canon || null == id || '' === id) continue

    const target = await loadRow(seneca, canon, id)
    if (null == target) return 'unknown-reference:' + field
    if (crossTenant(owner, target.data$(false))) return 'cross-tenant-reference:' + field
  }
  return null
}

/**
 * Refuse a parent that would cycle, or that the kind rules forbid.
 *
 * THE CYCLE GUARD RUNS BEFORE STORING, ALWAYS. After storing, every tree
 * resolver and clone:fixture recurses for ever - which is why
 * concern:fixture,check:cycle carries that warning in its own doc comment.
 *
 * `fixture_id` is null for a row that does not exist yet: a new segment
 * cannot be its own ancestor, so only the kind rules apply.
 */
export async function checkParent(
  seneca: any, fixture_id: string | null, parent_id: any, kind: string,
  hasChildren = false,
): Promise<string | null> {
  const parent = await loadRow(seneca, 'cag/fixture', parent_id)
  if (null != parent_id && '' !== parent_id && null == parent) {
    return 'unknown-reference:parent_id'
  }

  const verdict = parentKindVerdict(
    kind,
    null == parent ? null : String(parent.kind ?? ''),
    hasChildren,
  )
  if (null != verdict) return 'bad-parent-kind:' + verdict

  if (null == fixture_id) return null

  const cycle = await seneca.post('concern:fixture,check:cycle', {
    fixture_id,
    ...(null == parent_id || '' === parent_id ? {} : { parent_id: String(parent_id) }),
  })
  if (!cycle.ok) return cycle.why || 'fixture-cycle'

  return null
}

/**
 * Save a change onto a loaded row, with the tenant pinned to what was STORED.
 *
 * `org_id` is re-applied from the row rather than trusted from anywhere else,
 * so even a future caller that manages to get one into `data` cannot move a
 * row between organisations.
 */
export async function saveRow(seneca: any, row: any, data: any): Promise<any> {
  const stored = row.data$(false)
  const fields: any = { ...data, t_m: nowOf(seneca) }
  if (null != stored.org_id) fields.org_id = stored.org_id
  const saved = await row.data$(fields).save$()
  return tidy(saved.data$(false))
}
