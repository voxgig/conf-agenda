import { test, describe } from 'node:test'
import assert from 'node:assert'

import { makeSeneca, as } from './ent.setup'


// The browser proxies: aim:web,on:ent,cmd:* -> aim:ent,cmd:*
//
// A browser may only send aim:web, so these four actions ARE the entity
// surface. Two things matter: they forward faithfully, and they are not a
// way around the rules the real commands enforce.
//
// Forwarding is checked on the action functions directly - they are plain
// modules, so a fake `this` records what they post. No boot, no store, and
// nothing that depends on which entities this model happens to have.

const ALICE = { id: 'u-alice', email: 'alice@ex.com' }

const OPS = ['list', 'load', 'save', 'remove']

function proxyAction(op: string) {
  return require('../../../../dist/srv/ent/web_cmd_' + op + '.js')()
}

// A `this` that records posts instead of sending them.
function recorder(result: any = { ok: true }) {
  const posts: any[] = []
  return {
    posts,
    ctx: {
      post: async (pattern: string, msg: any) => {
        posts.push({ pattern, msg })
        return result
      },
    },
  }
}


describe('entity browser proxies', () => {

  test('each proxy forwards to its own entity command', async () => {
    for (const op of OPS) {
      const rec = recorder()
      await proxyAction(op).call(rec.ctx, { ent: 'x/y' })
      assert.strictEqual(rec.posts.length, 1, op)
      assert.strictEqual(rec.posts[0].pattern, 'aim:ent,cmd:' + op, op)
    }
  })


  test('arguments travel through unchanged', async () => {
    const rec = recorder()

    await proxyAction('list').call(rec.ctx, { ent: 'x/y', q: { a: 1 } })
    assert.deepStrictEqual(rec.posts[0].msg.q, { a: 1 })
    assert.strictEqual(rec.posts[0].msg.ent, 'x/y')

    await proxyAction('load').call(rec.ctx, { ent: 'x/y', id: 'e01' })
    assert.strictEqual(rec.posts[1].msg.id, 'e01')

    await proxyAction('save').call(rec.ctx, { ent: 'x/y', item: { t: 'v' } })
    assert.deepStrictEqual(rec.posts[2].msg.item, { t: 'v' })

    await proxyAction('remove').call(rec.ctx, { ent: 'x/y', id: 'e01' })
    assert.strictEqual(rec.posts[3].msg.id, 'e01')
  })


  test('the result is returned unchanged', async () => {
    const rec = recorder({ ok: true, list: [{ id: 'e01' }] })
    const out = await proxyAction('list').call(rec.ctx, { ent: 'x/y' })
    assert.deepStrictEqual(out, { ok: true, list: [{ id: 'e01' }] })

    const failed = recorder({ ok: false, why: 'forbidden' })
    const bad = await proxyAction('load').call(failed.ctx, { ent: 'x/y', id: 'e01' })
    assert.deepStrictEqual(bad, { ok: false, why: 'forbidden' })
  })


  test('proxies enforce the same rules, not weaker ones', async () => {
    const seneca = await makeSeneca()

    // Unauthenticated: refused, exactly like the real commands.
    for (const cmd of OPS) {
      const out = await seneca.post({
        aim: 'web', on: 'ent', cmd, ent: 'sys/user', id: 'x', item: {},
      })
      assert.strictEqual(out.ok, false, cmd)
      assert.strictEqual(out.why, 'not-authenticated', cmd)
    }

    // The sys zone stays unreachable through the proxy.
    const sys = await as(seneca, ALICE,
      { aim: 'web', on: 'ent', cmd: 'list', ent: 'sys/apikey' })
    assert.strictEqual(sys.ok, false)
    assert.strictEqual(sys.why, 'unknown-entity')

    // sys/user remains read-only through it too.
    const write = await as(seneca, ALICE, {
      aim: 'web', on: 'ent', cmd: 'save', ent: 'sys/user', item: { name: 'Hacked' },
    })
    assert.strictEqual(write.ok, false)
    assert.strictEqual(write.why, 'read-only')

    await seneca.close()
  })
})
