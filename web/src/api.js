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

// Writes are STAGE 2. They arrive as per-field intent messages - `update:speaker`
// with exactly the editable fields (SPEC 9) - not as a generic save, so the
// shape is a real decision rather than a stopgap. Until then, say so plainly
// rather than failing in a way that looks like a bug.
const NOT_YET = {
  ok: false,
  why: 'read-only-stage-1',
  message: 'Editing arrives in Stage 2, as per-entity intent messages.',
}

// The UI has to be able to ASK, rather than offering New / Edit / Delete and
// finding out afterwards. A control that looks live and silently does nothing
// is worse than one that is plainly disabled and says why.
function canWrite() {
  return false
}

function writeBlockedReason() {
  return NOT_YET.message
}

async function save() {
  return NOT_YET
}

async function remove() {
  return NOT_YET
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
