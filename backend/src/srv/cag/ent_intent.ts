//// Per-entity write intents for the generated admin (SPEC 9).
////
//// "The generated admin screens for speakers, rooms and tracks drive
//// entity-specific intent messages generated from the model (`update:speaker`
//// with exactly the editable fields - PLATFORM 1.2), never a generic
//// canon-plus-item save."
////
//// GENERATED IS WHAT THE SPEC WANTS AND WHAT DOES NOT EXIST YET. PLATFORM 1.2
//// calls the admin-generation change a `@voxgig/build` delta; until it lands
//// these are hand-written, exactly as the per-entity READS were
//// (docs/decisions/web-env-and-generic-ent.md, option 3). The shape is what
//// matters: the entity is named by the PATTERN, the editable fields are a
//// CLOSED list, and the browser cannot choose either.
////
//// EDITABLE is the hand-written half, so a test walks the model and asserts
//// it still matches - that test is the generator we do not have.

import { crossTenant } from '../../lib/validate/references'
import { nowOf, tidy } from './intent_util'

/**
 * The fields the admin may write, per entity.
 *
 * NOT id, org_id, t_c or t_m. Those are server-managed, which is why the model
 * marks them `valid: Skip` - they are filled AFTER validation runs - and why
 * a caller naming one is a caller trying to move a row between tenants.
 */
export const EDITABLE: Record<string, string[]> = {
  'cag/room': ['name', 'capacity', 'floor', 'access', 'order'],
  'cag/track': ['name', 'color', 'desc', 'order'],
  'cag/speaker': ['name', 'email', 'bio', 'photo', 'org_name', 'w_site'],
  // An appearance's IDENTITY is (fixture_id, speaker_id). Changing either is
  // remove-then-add, which is what the grid's add:appearance /
  // remove:appearance intents already are - so only the qualifiers are
  // editable here.
  'cag/appearance': ['role', 'order'],
}

/**
 * What would be orphaned by deleting this row.
 *
 * A room a session still points at is not a spare row: deleting it turns
 * every one of those sessions into an `unknown-reference` at validate time,
 * and the organiser finds out at publish rather than at the click. Refusing
 * is the kinder failure, and it names what is holding the row.
 */
const REFERENCED_BY: Record<string, { canon: string; field: string }[]> = {
  'cag/room': [{ canon: 'cag/fixture', field: 'room_id' }],
  'cag/track': [{ canon: 'cag/fixture', field: 'track_id' }],
  'cag/speaker': [{ canon: 'cag/appearance', field: 'speaker_id' }],
  'cag/appearance': [],
}

/** Only the editable keys the caller actually sent. */
function pickEditable(canon: string, msg: any): any {
  const out: any = {}
  for (const f of EDITABLE[canon] || []) {
    if (undefined === msg[f]) continue
    out[f] = msg[f]
  }
  return out
}

/**
 * The fields a CREATE must supply even when the form left them blank.
 *
 * BOTH FACES OF THE SAME TRAP, and they pull in opposite directions:
 * `valid: Skip` lets a field be ABSENT but rejects `''`, while
 * `valid: 'Empty'` permits `''` but still REQUIRES the key. So a create
 * cannot blanket-default everything to `''` (Skip fields would fail) and
 * cannot blanket-omit (Empty fields would fail).
 *
 * Read from the model rather than listed here, so a field that changes its
 * validator does not need this file changed too - and so the next `Empty`
 * field somebody adds is handled before it is noticed. `cag/speaker.email` is
 * the one that found this, for the third time in this project.
 */
function emptyDefaults(seneca: any, canon: string, supplied: any): any {
  const model = seneca.context && seneca.context.model
  const [zone, name] = canon.split('/')
  const def = model && model.main && model.main.ent
    && model.main.ent[zone] && model.main.ent[zone][name]
  if (null == def || null == def.field) return {}

  const out: any = {}
  for (const f of EDITABLE[canon] || []) {
    if (undefined !== supplied[f]) continue
    if ('Empty' === (def.field[f] || {}).valid) out[f] = ''
  }
  return out
}


export function makeCreate(canon: string) {
  return function () {
    return async function (this: any, msg: any) {
      const seneca = this

      // TENANCY FROM A NAMED STORED ROW, exactly as make:segment takes it
      // from its parent. A create has no row of its own to read it off, so it
      // names the CONFERENCE it belongs to and the org comes from that
      // fixture - not from the payload, and not from a guess.
      //
      // The first version derived it from "the caller's only org", which read
      // well and does not work: this app's own seed carries two organisations
      // and the signed-in user is linked to neither, so every create refused
      // with no-org. "New room" means "new room in the conference I am
      // working on", and the message now says so.
      const top = await seneca.entity('cag/fixture').load$(msg.conference_id)
      if (null == top) return { ok: false, why: 'unknown-conference' }
      const org_id = top.org_id
      if (null == org_id) return { ok: false, why: 'no-org' }

      const fields = pickEditable(canon, msg)
      const t = nowOf(seneca)
      const saved = await seneca.entity(canon).make$().data$({
        ...emptyDefaults(seneca, canon, fields),
        ...fields, org_id, t_c: t, t_m: t,
      }).save$()

      const item = tidy(saved.data$(false))
      return { ok: true, item, id: item.id }
    }
  }
}


export function makeUpdate(canon: string) {
  return function () {
    return async function (this: any, msg: any) {
      const seneca = this

      const row = await seneca.entity(canon).load$(msg.id)
      if (null == row) return { ok: false, why: 'not-found' }
      const stored = row.data$(false)

      const fields = pickEditable(canon, msg)

      // `prev` CARRIES EVERY EDITABLE FIELD, not only the ones that changed.
      //
      // The declared inverse map is static - it names fields, and a field
      // missing from `prev` resolves to undefined, which makes buildInverse
      // refuse rather than post a half-built edit. So a map that named only
      // the changed fields could not exist, and one that named all of them
      // would break on every partial update.
      //
      // Carrying all of them is also what matches this surface: the admin
      // form submits every field, so an update is already a whole-row write.
      // An undo therefore restores the whole row, which is the same grain.
      const prev: any = { id: stored.id }
      for (const f of EDITABLE[canon] || []) {
        // '' and not undefined: an absent key would make the inverse refuse,
        // and these fields are exactly the ones a form can clear.
        prev[f] = undefined === stored[f] ? '' : stored[f]
      }

      // Tenancy pinned to the STORED row, always. The params shape has no
      // org_id, so there is nothing to send - this is the second half.
      const saved = await row.data$({
        ...fields,
        ...(null == stored.org_id ? {} : { org_id: stored.org_id }),
        t_m: nowOf(seneca),
      }).save$()

      return { ok: true, item: tidy(saved.data$(false)), prev }
    }
  }
}


export function makeRemove(canon: string) {
  return function () {
    return async function (this: any, msg: any) {
      const seneca = this

      const row = await seneca.entity(canon).load$(msg.id)
      if (null == row) return { ok: false, why: 'not-found' }
      const stored = row.data$(false)

      for (const ref of REFERENCED_BY[canon] || []) {
        const holders = (await seneca.entity(ref.canon).list$({ [ref.field]: stored.id }))
        if (0 < holders.length) {
          return {
            ok: false,
            why: 'in-use',
            // Name what is holding it. "Cannot delete" with no reason sends
            // an organiser hunting through the whole programme.
            count: holders.length,
            held_by: ref.canon,
          }
        }
      }

      await seneca.entity(canon).remove$(stored.id)

      // NO `prev`, and no declared inverse. Re-creating a deleted row gives
      // it a NEW id, so every reference that pointed at the old one would
      // still be broken - an undo that looks like it worked and did not. The
      // two-step confirmation in the admin is the guard instead.
      return { ok: true, id: stored.id }
    }
  }
}


/** A browser proxy for a write intent: the closed field list is the whitelist. */
export function makeWebWrite(pattern: string, canon: string, extra: string[] = []) {
  const allow = [...extra, ...(EDITABLE[canon] || [])]
  return function () {
    return async function (this: any, msg: any) {
      const args: any = {}
      for (const k of allow) if (undefined !== msg[k]) args[k] = msg[k]
      return this.post(pattern, args)
    }
  }
}

export { crossTenant }
