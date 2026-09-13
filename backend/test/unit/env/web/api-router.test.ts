import { test, describe } from 'node:test'
import assert from 'node:assert'

import Crypto from 'node:crypto'

import Seneca from 'seneca'

import Model from '../../../../model/model.json'
import { pickEntity } from '../../srv/api/api.setup'

// The router under test, plus a stub-friendly seneca. The API service and
// the entity service are stood in for with MOCK MESSAGES, so this covers
// the HTTP mapping alone: routing, key auth, status codes, result shaping.
const { apiHandler } = require('../../../../dist/env/web/api.js')


// The entity and the base path come from the model, so this suite holds
// for any entity graph.
const ENT = pickEntity()
const API = (Model as any).main.api || {}
const BASE = '/' + (API.version || 'v1') + '/' + (ENT ? ENT.canon : 'none/none')

const KEY = 'vk_' + 'a'.repeat(48)
const HASH = Crypto.createHash('sha256').update(KEY).digest('hex')


async function makeSeneca(opts: {
  keys?: any[],          // sys/apikey rows
  users?: any[],         // sys/user rows
  onEnt?: (msg: any) => any,
} = {}) {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.test().use('promisify').use('entity')

  seneca.message('aim:api,on:ent', async function (msg: any) {
    return opts.onEnt ? opts.onEnt(msg) : { ok: true, items: [], item: null }
  })

  await seneca.ready()

  for (const k of opts.keys || []) {
    await seneca.entity('sys/apikey').data$(k).save$()
  }
  for (const u of opts.users || []) {
    await seneca.entity('sys/user').data$(u).save$()
  }

  return seneca
}


// Minimal express-alike req/res.
function reqres(method: string, path: string, opts: {
  headers?: Record<string, string>, body?: any, query?: any,
} = {}) {
  const req = {
    method,
    path,
    headers: opts.headers || {},
    body: opts.body,
    query: opts.query || {},
  }
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    sentFile: undefined as any,
    type() {
      return res
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    send(payload: any) {
      res.body = payload
      return res
    },
    sendFile(p: string) {
      res.sentFile = p
      return res
    },
  }
  return { req, res }
}


const authed = { authorization: 'Bearer ' + KEY }

function liveKey() {
  return [{ id: 'k01', user_id: 'u01', name: 'ci', hash: HASH, revoked: false }]
}
function liveUser() {
  return [{ id: 'u01', email: 'alice@ex.com', name: 'Alice', pass: 'SECRET', salt: 'S' }]
}


describe('rest api router', () => {

  // Every routed case needs an exposed entity to address.
  const needEnt = (t: any) => (ENT ? false : (t.skip('model exposes no entities'), true))


  test('serves the generated openapi spec unauthenticated', async () => {
    const seneca = await makeSeneca()
    const handle = apiHandler(seneca, Model)

    const { req, res } = reqres('GET', '/openapi.json')
    await handle(req, res)
    assert.ok(String(res.sentFile).endsWith('openapi.json'))
    await seneca.close()
  })


  test('requires a valid, unrevoked key', async (t) => {
    if (needEnt(t)) { return }
    const seneca = await makeSeneca({ keys: liveKey(), users: liveUser() })
    const handle = apiHandler(seneca, Model)

    // No header.
    let rr = reqres('GET', BASE)
    await handle(rr.req, rr.res)
    assert.strictEqual(rr.res.statusCode, 401)
    assert.strictEqual(rr.res.body.error.code, 'not-authenticated')

    // Malformed header.
    rr = reqres('GET', BASE, { headers: { authorization: 'Basic xyz' } })
    await handle(rr.req, rr.res)
    assert.strictEqual(rr.res.statusCode, 401)

    // Unknown key.
    rr = reqres('GET', BASE,
      { headers: { authorization: 'Bearer vk_nope' } })
    await handle(rr.req, rr.res)
    assert.strictEqual(rr.res.statusCode, 401)

    // Valid key.
    rr = reqres('GET', BASE, { headers: authed })
    await handle(rr.req, rr.res)
    assert.strictEqual(rr.res.statusCode, 200)

    await seneca.close()
  })


  test('a revoked key fails immediately', async (t) => {
    if (needEnt(t)) { return }
    const seneca = await makeSeneca({
      keys: [{ id: 'k01', user_id: 'u01', hash: HASH, revoked: true }],
      users: liveUser(),
    })
    const handle = apiHandler(seneca, Model)

    const { req, res } = reqres('GET', BASE, { headers: authed })
    await handle(req, res)
    assert.strictEqual(res.statusCode, 401)
    await seneca.close()
  })


  test('a key whose user is gone fails', async (t) => {
    if (needEnt(t)) { return }
    const seneca = await makeSeneca({ keys: liveKey() })
    const handle = apiHandler(seneca, Model)

    const { req, res } = reqres('GET', BASE, { headers: authed })
    await handle(req, res)
    assert.strictEqual(res.statusCode, 401)
    await seneca.close()
  })


  test('maps methods and paths onto api operations', async (t) => {
    if (needEnt(t)) { return }
    const seen: any[] = []
    const seneca = await makeSeneca({
      keys: liveKey(), users: liveUser(),
      onEnt: (msg: any) => {
        seen.push({ op: msg.op, ent: msg.ent, id: msg.id, data: msg.data, q: msg.q })
        return 'remove' === msg.op ? { ok: true, id: msg.id }
          : 'list' === msg.op ? { ok: true, items: [{ id: 'p01' }] }
            : { ok: true, item: { id: msg.id || 'p01' } }
      },
    })
    const handle = apiHandler(seneca, Model)

    let rr = reqres('GET', BASE, { headers: authed, query: { name: 'x' } })
    await handle(rr.req, rr.res)
    assert.strictEqual(rr.res.statusCode, 200)
    assert.deepStrictEqual(rr.res.body.items, [{ id: 'p01' }])
    assert.deepStrictEqual(seen[0], {
      op: 'list', ent: ENT!.canon, id: undefined, data: undefined, q: { name: 'x' },
    })

    rr = reqres('GET', BASE + '/p01', { headers: authed })
    await handle(rr.req, rr.res)
    assert.strictEqual(seen[1].op, 'load')
    assert.strictEqual(seen[1].id, 'p01')

    rr = reqres('POST', BASE, { headers: authed, body: { name: 'New' } })
    await handle(rr.req, rr.res)
    // Creation answers 201.
    assert.strictEqual(rr.res.statusCode, 201)
    assert.strictEqual(seen[2].op, 'create')
    assert.deepStrictEqual(seen[2].data, { name: 'New' })

    rr = reqres('PUT', BASE + '/p01', { headers: authed, body: { note: 'n' } })
    await handle(rr.req, rr.res)
    assert.strictEqual(seen[3].op, 'update')

    rr = reqres('DELETE', BASE + '/p01', { headers: authed })
    await handle(rr.req, rr.res)
    assert.strictEqual(seen[4].op, 'remove')
    assert.deepStrictEqual(rr.res.body, { ok: true, id: 'p01' })

    await seneca.close()
  })


  test('rejects unroutable paths and method/path combinations', async (t) => {
    if (needEnt(t)) { return }
    const seneca = await makeSeneca({ keys: liveKey(), users: liveUser() })
    const handle = apiHandler(seneca, Model)

    // Wrong version, too short, too long.
    for (const p of ['/v9/a/b', '/v1/a', '/v1/a/b/c/d']) {
      const rr = reqres('GET', p, { headers: authed })
      await handle(rr.req, rr.res)
      assert.strictEqual(rr.res.statusCode, 404, p)
    }

    // POST to an id path, PUT/DELETE to a collection path.
    for (const [m, p] of [['POST', BASE + '/p01'],
    ['PUT', BASE], ['DELETE', BASE]]) {
      const rr = reqres(m, p, { headers: authed })
      await handle(rr.req, rr.res)
      assert.strictEqual(rr.res.statusCode, 405, m + ' ' + p)
    }

    await seneca.close()
  })


  test('maps service failures onto http status codes', async (t) => {
    if (needEnt(t)) { return }
    const cases: [string, number][] = [
      ['unknown-entity', 404],
      ['not-found', 404],
      ['forbidden', 403],
      ['invalid-data', 400],
      ['project-required', 400],
      ['read-only', 405],
      ['not-authenticated', 401],
      ['something-else', 500],
    ]

    for (const [why, status] of cases) {
      const seneca = await makeSeneca({
        keys: liveKey(), users: liveUser(),
        onEnt: () => ({ ok: false, why, message: 'nope', details: [{ path: 'x' }] }),
      })
      const handle = apiHandler(seneca, Model)

      const { req, res } = reqres('GET', BASE, { headers: authed })
      await handle(req, res)
      assert.strictEqual(res.statusCode, status, why)
      assert.strictEqual(res.body.error.code, why)
      assert.strictEqual(res.body.error.message, 'nope')
      assert.ok(res.body.error.details)
      await seneca.close()
    }
  })


  test('an unexpected error becomes a 500', async (t) => {
    if (needEnt(t)) { return }
    const seneca = await makeSeneca({
      keys: liveKey(), users: liveUser(),
      onEnt: () => {
        throw new Error('boom')
      },
    })
    const handle = apiHandler(seneca, Model)

    const { req, res } = reqres('GET', BASE, { headers: authed })
    await handle(req, res)
    assert.strictEqual(res.statusCode, 500)
    assert.strictEqual(res.body.error.code, 'error')
    await seneca.close()
  })


  test('the principal never carries credentials', async (t) => {
    if (needEnt(t)) { return }
    let principal: any = null
    const seneca = await makeSeneca({
      keys: liveKey(), users: liveUser(),
      onEnt: (msg: any) => {
        principal = msg.custom$.principal.user
        return { ok: true, items: [] }
      },
    })
    const handle = apiHandler(seneca, Model)

    const { req, res } = reqres('GET', BASE, { headers: authed })
    await handle(req, res)

    assert.strictEqual(principal.id, 'u01')
    assert.strictEqual(principal.email, 'alice@ex.com')
    assert.strictEqual(principal.pass, undefined)
    assert.strictEqual(principal.salt, undefined)
    await seneca.close()
  })
})
