import { test, describe } from 'node:test'
import assert from 'node:assert'

import Crypto from 'node:crypto'

import { makeSeneca, as } from './auth.setup'


// API access keys: the raw key is shown once, only its hash is stored,
// revocation is immediate, and the gateway wrappers act on the SIGNED-IN
// user rather than a caller-supplied id.
describe('api keys', () => {

  test('create returns the key once and stores only its hash', async () => {
    const seneca = await makeSeneca()

    const made = await seneca.post('aim:auth,create:apikey',
      { user_id: 'u01', name: 'ci' })
    assert.strictEqual(made.ok, true)
    assert.ok(made.key.startsWith('vk_'))
    assert.strictEqual(made.item.name, 'ci')
    assert.strictEqual(made.item.revoked, false)
    // The public view never carries the hash.
    assert.strictEqual((made.item as any).hash, undefined)
    assert.strictEqual(made.item.prefix, made.key.slice(0, 8))

    // What is stored is the sha-256 of the key, not the key.
    const stored = await seneca.entity('sys/apikey').load$(made.item.id)
    const hash = Crypto.createHash('sha256').update(made.key).digest('hex')
    assert.strictEqual(stored.hash, hash)
    assert.ok(!JSON.stringify(stored.data$(false)).includes(made.key))

    await seneca.close()
  })


  test('create rejects missing arguments', async () => {
    const seneca = await makeSeneca()

    const nouser = await seneca.post('aim:auth,create:apikey', { name: 'x' })
    assert.strictEqual(nouser.ok, false)
    assert.strictEqual(nouser.why, 'invalid-args')

    const noname = await seneca.post('aim:auth,create:apikey',
      { user_id: 'u01', name: '  ' })
    assert.strictEqual(noname.ok, false)
    assert.strictEqual(noname.why, 'invalid-args')

    await seneca.close()
  })


  test('list returns only that user keys, without hashes', async () => {
    const seneca = await makeSeneca()

    await seneca.post('aim:auth,create:apikey', { user_id: 'u01', name: 'a' })
    await seneca.post('aim:auth,create:apikey', { user_id: 'u01', name: 'b' })
    await seneca.post('aim:auth,create:apikey', { user_id: 'u02', name: 'other' })

    const mine = await seneca.post('aim:auth,list:apikey', { user_id: 'u01' })
    assert.strictEqual(mine.ok, true)
    assert.strictEqual(mine.items.length, 2)
    assert.deepStrictEqual(mine.items.map((k: any) => k.name).sort(), ['a', 'b'])
    assert.ok(mine.items.every((k: any) => undefined === k.hash))

    const bad = await seneca.post('aim:auth,list:apikey', {})
    assert.strictEqual(bad.ok, false)
    assert.strictEqual(bad.why, 'invalid-args')

    await seneca.close()
  })


  test('revoke marks the key revoked, and only for its owner', async () => {
    const seneca = await makeSeneca()

    const made = await seneca.post('aim:auth,create:apikey',
      { user_id: 'u01', name: 'ci' })

    // Another user cannot revoke it.
    const notmine = await seneca.post('aim:auth,revoke:apikey',
      { user_id: 'u02', id: made.item.id })
    assert.strictEqual(notmine.ok, false)
    assert.strictEqual(notmine.why, 'not-found')

    const gone = await seneca.post('aim:auth,revoke:apikey',
      { user_id: 'u01', id: made.item.id })
    assert.strictEqual(gone.ok, true)
    assert.strictEqual(gone.item.revoked, true)

    // The record is kept (audit trail), flagged revoked.
    const list = await seneca.post('aim:auth,list:apikey', { user_id: 'u01' })
    assert.strictEqual(list.items.length, 1)
    assert.strictEqual(list.items[0].revoked, true)

    const missing = await seneca.post('aim:auth,revoke:apikey',
      { user_id: 'u01', id: 'nope' })
    assert.strictEqual(missing.ok, false)
    assert.strictEqual(missing.why, 'not-found')

    const bad = await seneca.post('aim:auth,revoke:apikey', { user_id: 'u01' })
    assert.strictEqual(bad.ok, false)
    assert.strictEqual(bad.why, 'invalid-args')

    await seneca.close()
  })


  test('the gateway wrappers use the signed-in user', async () => {
    const seneca = await makeSeneca()

    // Unauthenticated calls are refused.
    for (const msg of [
      { aim: 'web', on: 'auth', create: 'apikey', name: 'x' },
      { aim: 'web', on: 'auth', list: 'apikey' },
      { aim: 'web', on: 'auth', revoke: 'apikey', id: 'x' },
    ]) {
      const out = await seneca.post(msg)
      assert.strictEqual(out.ok, false)
      assert.strictEqual(out.why, 'not-authenticated')
    }

    const made = await as(seneca, { id: 'u01' },
      { aim: 'web', on: 'auth', create: 'apikey', name: 'from-web' })
    assert.strictEqual(made.ok, true)

    // The key belongs to the signed-in user, not anyone named in the msg.
    const stored = await seneca.entity('sys/apikey').load$(made.item.id)
    assert.strictEqual(stored.user_id, 'u01')

    const mine = await as(seneca, { id: 'u01' },
      { aim: 'web', on: 'auth', list: 'apikey' })
    assert.strictEqual(mine.items.length, 1)

    // Another user sees none of them, and cannot revoke.
    const others = await as(seneca, { id: 'u02' },
      { aim: 'web', on: 'auth', list: 'apikey' })
    assert.strictEqual(others.items.length, 0)

    const denied = await as(seneca, { id: 'u02' },
      { aim: 'web', on: 'auth', revoke: 'apikey', id: made.item.id })
    assert.strictEqual(denied.ok, false)

    const revoked = await as(seneca, { id: 'u01' },
      { aim: 'web', on: 'auth', revoke: 'apikey', id: made.item.id })
    assert.strictEqual(revoked.ok, true)
    assert.strictEqual(revoked.item.revoked, true)

    await seneca.close()
  })
})
