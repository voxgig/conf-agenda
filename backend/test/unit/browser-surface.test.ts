import { describe, test } from 'node:test'
import assert from 'node:assert'

import Model from '../../model/model.json'

// THE BROWSER SURFACE (PLATFORM 1.2): aim:web is the only namespace the
// gateway accepts, and every browser-reachable operation is a declared proxy.
//
// PLATFORM 10: "A test that walks the model must be able to fail." todo-app's
// own surface test went vacuously green the day main.msg became a list - a
// chain walk over a list finds nothing and every assertion passes. So this
// asserts a known-PRESENT and a known-ABSENT case, and one assertion proves
// the walk itself found something.

const MSG: any[] = (Model as any).main.msg

const pattern = (m: any) =>
  m.pat.map((p: any) => Object.entries(p)[0].join(':')).join(',')

const patterns = () => MSG.map(pattern)

describe('browser surface', () => {
  test('the model walk finds messages at all', () => {
    // The guard against a vacuous pass: if main.msg ever changes shape again,
    // this fails first and loudly instead of everything below passing empty.
    assert.ok(Array.isArray(MSG), 'main.msg is a list (PLATFORM 1.4)')
    assert.ok(MSG.length > 0, 'and the walk found some')
    for (const m of MSG) {
      assert.ok(Array.isArray(m.pat) && m.pat.length > 0, 'every definition has a pattern')
    }
  })

  test('known-PRESENT: the grid read is a declared aim:web proxy', () => {
    assert.ok(patterns().includes('aim:web,on:cag,load:tree'))
  })

  test('known-ABSENT: no generic entity surface reaches the browser', () => {
    // SPEC 9 / PLATFORM 1.2: nothing shaped like on:ent,cmd:save with an open
    // canon-plus-item payload - the surface the tenant-from-payload flaw rode
    // in on. @voxgig/build still GENERATES src/srv/ent, but this project does
    // not declare it, so it is unreachable. todo-app made the same move: its
    // msg.aon declares per-entity semantic messages instead.
    for (const p of patterns()) {
      assert.ok(!/on:ent/.test(p), 'generic entity proxy declared: ' + p)
      assert.ok(!/cmd:(save|remove|list|load)/.test(p), 'generic CRUD declared: ' + p)
    }
  })

  test('every browser message is a proxy, never a service message', () => {
    for (const p of patterns()) {
      if (!p.startsWith('aim:web')) continue
      assert.match(p, /^aim:web,on:[a-z]+,/, 'aim:web messages proxy a named service: ' + p)
    }
  })

  test('service namespaces are not themselves browser-reachable', () => {
    // aim:cag and aim:agenda must be reachable only THROUGH a proxy.
    const web = patterns().filter((p) => p.startsWith('aim:web'))
    for (const p of web) {
      assert.ok(!p.startsWith('aim:cag'), p)
      assert.ok(!p.startsWith('aim:agenda'), p)
    }
  })

  test('every proxy names its own action file', () => {
    // A proxy shares its LAST pattern pair with the message it forwards to, so
    // the derived filename would collide - `file` is what settles it
    // (PLATFORM 1.4).
    for (const m of MSG) {
      if (!pattern(m).startsWith('aim:web')) continue
      assert.ok(m.file, 'proxy without an explicit file: ' + pattern(m))
    }
  })
})
