import Seneca from 'seneca'

import Model from '../../../../model/model.json'

const Expose = require('../../../../dist/srv/api/expose.js')


// Seneca with the REST API service loaded from compiled dist/srv.
//
// The generic entity service is NOT loaded: it is stood in for with MOCK
// MESSAGES (see mockEnt below), so these tests exercise the API layer -
// exposure rules, generated-shape validation, op routing, result shaping -
// in isolation, with no store and no access control in the way.
async function makeSeneca(mock?: (seneca: any) => void) {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()

  seneca
    .use('promisify')
    .use('reload')
    .use('../../../../dist/srv/api/api-srv')

  if (mock) {
    mock(seneca)
  }

  return seneca.ready()
}


// Stand-in for the generic entity service: records the calls it receives
// and answers from a simple in-test store.
function mockEnt(store: Record<string, any[]> = {}) {
  const calls: any[] = []

  const install = (seneca: any) => {
    seneca.message('aim:ent,cmd:list', async function (msg: any) {
      calls.push({ cmd: 'list', ent: msg.ent, q: msg.q })
      const list = (store[msg.ent] || []).filter((item: any) =>
        Object.keys(msg.q || {}).every((k) => item[k] === msg.q[k]))
      return { ok: true, list }
    })

    seneca.message('aim:ent,cmd:load', async function (msg: any) {
      calls.push({ cmd: 'load', ent: msg.ent, id: msg.id })
      const item = (store[msg.ent] || []).find((i: any) => i.id === msg.id)
      return { ok: true, item: item || null }
    })

    seneca.message('aim:ent,cmd:save', async function (msg: any) {
      calls.push({ cmd: 'save', ent: msg.ent, item: msg.item })
      const item = Object.assign({ id: msg.item.id || 'new01' }, msg.item)
      store[msg.ent] = (store[msg.ent] || []).filter((i: any) => i.id !== item.id)
      store[msg.ent].push(item)
      return { ok: true, item }
    })

    seneca.message('aim:ent,cmd:remove', async function (msg: any) {
      calls.push({ cmd: 'remove', ent: msg.ent, id: msg.id })
      store[msg.ent] = (store[msg.ent] || []).filter((i: any) => i.id !== msg.id)
      return { ok: true, id: msg.id }
    })
  }

  return { install, calls, store }
}


// Post an API message AS a given user (the router resolves the principal
// from the API key and passes it the same way).
function as(seneca: any, user: any, msg: any) {
  return seneca.post(Object.assign({}, msg, {
    custom$: { principal: { user } },
  }))
}


// ---- model-driven test subject -----------------------------------------
//
// These tests must hold for ANY model, so the entity under test and the
// payloads are derived from the model rather than hard-coded.

// Fields the server owns: never client-writable.
const MANAGED = ['id', 'owner_id', 't_c', 't_m']

const SAMPLE: Record<string, any> = {
  String: 'test-value',
  Number: 42,
  Boolean: true,
}

// The wrong type to send for a given kind (to trip validation).
const WRONG: Record<string, any> = {
  String: 123,
  Number: 'not-a-number',
  Boolean: 'not-a-boolean',
}


// Pick an entity the API exposes, with everything a test needs to build
// valid and invalid payloads for it. Returns null for a model with no
// exposed entities (a brand new project).
function pickEntity() {
  const canons: string[] = Expose.exposedCanons(Model)
  if (0 === canons.length) {
    return null
  }

  const canon = canons[0]
  const [zone, name] = canon.split('/')
  const fields = ((Model as any).main.ent[zone][name] || {}).field || {}

  const writable = Object.keys(fields).filter((f) => !MANAGED.includes(f))
  const required = writable.filter((f) => {
    const valid = null == fields[f].valid ? '' : String(fields[f].valid)
    return !/Skip/.test(valid)
  })

  const kindOf = (f: string) =>
    ['String', 'Number', 'Boolean'].includes(fields[f].kind) ? fields[f].kind : 'String'

  // A minimal valid payload: every required field, nothing else.
  const valid = () => required.reduce((a: any, f: string) =>
    (a[f] = SAMPLE[kindOf(f)], a), {} as any)

  // A payload with one field of the wrong type, when the entity has a
  // field whose kind can be violated unambiguously.
  const typed = writable.find((f) => 'Number' === kindOf(f) || 'Boolean' === kindOf(f))
  const wrongType = () => {
    if (null == typed) {
      return null
    }
    return Object.assign(valid(), { [typed]: WRONG[kindOf(typed)] })
  }

  // A VALID value for a field that differs from what valid() sets, so a
  // partial update is observable.
  const patchValue = (f: string) => {
    const kind = kindOf(f)
    return 'String' === kind ? 'changed-value'
      : 'Number' === kind ? 99
        : false
  }

  return {
    canon, zone, name, fields, writable, required,
    valid, wrongType, kindOf, patchValue,
  }
}


export {
  makeSeneca,
  mockEnt,
  as,
  pickEntity,
  Model,
}
