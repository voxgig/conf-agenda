// Thin client over the Seneca bus.
//
// EVERY message the browser sends is an aim:web message: that is the only
// namespace the backend gateway accepts (see backend/src/env/web/web.ts),
// and each one is a declared proxy that forwards to the real service
// message. Entity CRUD still lands on the ONE generic backend service, so
// the same four calls serve every entity in the model.

import { bus } from './bus.js'

// ---- generic entity CRUD ------------------------------------------------

async function list(ent, q) {
  const r = await bus.post({ aim: 'web', on: 'ent', cmd: 'list', ent, q: q || {} })
  return (r && r.ok && r.list) || []
}

async function load(ent, id) {
  const r = await bus.post({ aim: 'web', on: 'ent', cmd: 'load', ent, id })
  return r && r.ok ? r.item : null
}

async function save(ent, item) {
  return bus.post({ aim: 'web', on: 'ent', cmd: 'save', ent, item })
}

async function remove(ent, id) {
  return bus.post({ aim: 'web', on: 'ent', cmd: 'remove', ent, id })
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
