// Thin client over the Seneca bus.
//
// EVERY message the browser sends is an aim:web message: that is the only
// namespace the backend gateway accepts (see backend/src/env/web/web.ts),
// and each one is a declared proxy that forwards to the real service
// message. Entity CRUD still lands on the ONE generic backend service, so
// the same four calls serve every entity in the model.

import { bus } from './bus.js'

// ---- entity reads ------------------------------------------------------
//
// NOT a generic entity surface. SPEC 9 and PLATFORM 1.2 forbid anything
// shaped like on:ent,cmd:save with an open canon-plus-item payload - that is
// the surface the tenant-from-payload flaw rode in on. Instead each entity has
// its OWN message, with the entity named by the pattern:
//
//   aim:web,on:cag,list:room   ->  aim:cag,list:room
//
// The canon is therefore not something the browser can choose. `ent` is
// mapped to a verb+noun pair here, so the generated admin components keep
// working unchanged.
//
// todo-app made the same move: its msg.aon declares per-entity semantic
// messages and routes the entity work through a concern. The generated
// src/srv/ent service is left undeclared and unreachable.

// canon -> the noun half of its message pair. An entity absent from this map
// has no browser surface at all, which is the default rather than an
// oversight: adding one is a deliberate act in msg.aon AND here.
const READABLE = {
  'cag/room': 'room',
  'cag/track': 'track',
  'cag/speaker': 'speaker',
  'cag/appearance': 'appearance',
  'cag/snapshot': 'snapshot',
}

function nounOf(ent) {
  return READABLE[ent]
}

// Whether an entity has a browser read surface at all. sys/org and sys/member
// do not: they are referenced BY cag rows but have no aim:web message, so a
// link to one is a link to "Not found."
function canRead(ent) {
  return null != READABLE[ent]
}

async function list(ent, q) {
  const noun = nounOf(ent)
  if (!noun) return []
  const r = await bus.post({ aim: 'web', on: 'cag', list: noun, q: q || {} })
  return (r && r.ok && r.list) || []
}

async function load(ent, id) {
  const noun = nounOf(ent)
  if (!noun) return null
  const r = await bus.post({ aim: 'web', on: 'cag', load: noun, id })
  return r && r.ok ? r.item : null
}

// ---- entity writes -----------------------------------------------------
//
// PER-ENTITY INTENTS, never a generic save (SPEC 9, PLATFORM 1.2). Each verb
// is its own message with the entity named by the PATTERN and a CLOSED list
// of editable fields, so the browser can neither choose a canon nor invent a
// field - and no write message carries a tenant at all.
//
//   aim:web,on:cag,update:speaker  ->  aim:cag,update:speaker
//
// WRITABLE is deliberately not READABLE. `cag/snapshot` is published OUTPUT,
// written by publish:fixture; an admin that could edit one could make the
// public agenda disagree with the programme it was built from.
const WRITABLE = {
  'cag/room': { create: 'make:room', update: 'update:room', remove: 'remove:room' },
  'cag/track': { create: 'make:track', update: 'update:track', remove: 'remove:track' },
  'cag/speaker': { create: 'make:speaker', update: 'update:speaker', remove: 'remove:speaker' },
  // An appearance is created and removed by the GRID's intents - it is a join,
  // and both ends have to be named. Only its qualifiers are editable here.
  'cag/appearance': {
    create: 'add:appearance', update: 'update:appearance', remove: 'remove:appearance',
    idKey: 'appearance_id',
  },
}

const READ_ONLY = {
  ok: false,
  why: 'read-only-entity',
  message: 'Published snapshots are written by publishing, not by hand.',
}

// THE CONFERENCE A NEW ROW BELONGS TO.
//
// A create has no stored row to read a tenant off, so it names the conference
// and the server takes the org from THAT fixture - the same rule make:segment
// follows with its parent. "New room" means "new room in the conference I am
// working on", and this is where the app remembers which one that is.
let currentConference = null

function setConference(id) {
  if (null != id && '' !== id) currentConference = id
}

async function conferenceId() {
  if (null != currentConference) return currentConference
  // Not yet told - ask for the default the grid would open on.
  const r = await bus.post({ aim: 'web', on: 'cag', load: 'tree' })
  if (r && r.ok && r.top) currentConference = r.top.id
  return currentConference
}

// The UI has to be able to ASK, rather than offering New / Edit / Delete and
// finding out afterwards. A control that looks live and silently does nothing
// is worse than one that is plainly disabled and says why.
function canWrite(ent) {
  return null != WRITABLE[ent]
}

function writeBlockedReason(ent) {
  return canWrite(ent) ? '' : READ_ONLY.message
}

/**
 * Drop the cached reads for an entity after a write.
 *
 * THE SAME GAP THE GRID HAS, and worth stating rather than relying on. The
 * store's cache group is `zone / on / <value of the matched verb key>`, so
 * `list:speaker` sits in `web/cag/speaker` - and `update`/`remove` happen to
 * land in that same group while `make` is not a classified write verb at all
 * and passes straight through, invalidating nothing. A created row therefore
 * saved fine and never appeared.
 *
 * Rather than depend on which verbs the store happens to classify, every
 * write invalidates its own entity's group explicitly. One rule, and it does
 * not change when a verb is added.
 */
async function invalidate(ent) {
  const noun = nounOf(ent)
  if (null == noun) return
  try {
    await bus.act('sys:browser-store,invalidate:group', { group: 'web/cag/' + noun })
  } catch (e) {
    // No store registered (a bare test page). The caller reloads regardless.
  }
}

async function save(ent, payload) {
  const verbs = WRITABLE[ent]
  if (null == verbs) return READ_ONLY

  const data = Object.assign({}, payload)
  const id = data.id
  delete data.id

  if (null != id && '' !== id) {
    const [verb, noun] = verbs.update.split(':')
    const r = await bus.post({ aim: 'web', on: 'cag', [verb]: noun, id, ...data })
    if (r && r.ok) await invalidate(ent)
    return r || { ok: false, why: 'no-response' }
  }

  const [verb, noun] = verbs.create.split(':')
  const msg = { aim: 'web', on: 'cag', [verb]: noun, ...data }
  // Only a create needs it, and only for the entities that have no other row
  // to inherit from - an appearance names its segment already.
  if ('add:appearance' !== verbs.create) {
    msg.conference_id = await conferenceId()
    if (null == msg.conference_id) {
      return { ok: false, why: 'no-conference',
        message: 'Open a conference first — a new row belongs to one.' }
    }
  }
  const r = await bus.post(msg)
  if (r && r.ok) await invalidate(ent)
  return r || { ok: false, why: 'no-response' }
}

async function remove(ent, id) {
  const verbs = WRITABLE[ent]
  if (null == verbs) return READ_ONLY
  const [verb, noun] = verbs.remove.split(':')
  const key = verbs.idKey || 'id'
  const r = await bus.post({ aim: 'web', on: 'cag', [verb]: noun, [key]: id })
  if (r && r.ok) await invalidate(ent)
  return r || { ok: false, why: 'no-response' }
}

// Users, for reference pickers (read-only, public fields).
async function users() {
  return list('sys/user')
}

// ---- auth / settings ----------------------------------------------------

async function loadAuth() {
  return bus.post('aim:web,on:auth,load:auth')
}

async function signin(email, password) {
  return bus.post('aim:web,on:auth,signin:user', { email, password })
}

async function signout() {
  return bus.post('aim:web,on:auth,signout:user')
}

async function changePass(password) {
  return bus.post({ aim: 'web', on: 'auth', change: 'pass', password })
}

async function updateUser(data) {
  return bus.post({ aim: 'web', on: 'auth', update: 'user', data })
}

async function remindPass(email) {
  return bus.post({ aim: 'web', on: 'auth', remind: 'pass', email })
}

// ---- API access keys (REST API auth; Settings & security) ---------------

async function createApikey(name) {
  return bus.post({ aim: 'web', on: 'auth', create: 'apikey', name })
}

async function listApikeys() {
  return bus.post({ aim: 'web', on: 'auth', list: 'apikey' })
}

async function revokeApikey(id) {
  return bus.post({ aim: 'web', on: 'auth', revoke: 'apikey', id })
}

export {
  list,
  load,
  save,
  remove,
  canRead,
  canWrite,
  writeBlockedReason,
  setConference,
  users,
  loadAuth,
  signin,
  signout,
  changePass,
  updateUser,
  remindPass,
  createApikey,
  listApikeys,
  revokeApikey,
}
