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

describe('the calendar surface', () => {
  // This subsystem emails real people, so what is NOT reachable matters more
  // than what is. The safety rules (C4, C5, C10) sit in sys:calendar, which
  // has no aim: surface at all - the only way to reach sync is through the one
  // read-only proxy below.

  test('known-PRESENT: the sync PLAN is browser-reachable', () => {
    assert.ok(patterns().includes('aim:web,on:cag,plan:sync'))
  })

  test('apply:sync is reachable, and ONLY with an explicit confirmation', () => {
    // This assertion USED to be "nothing that sends is declared anywhere",
    // which was right while the safety machinery did not exist. It does now -
    // the cap, the redaction, the ledger gate, the lock and the queue - and
    // C4 asks for a confirmed apply on the app surface rather than none.
    //
    // So the rule narrows rather than relaxes: apply is declared, and `confirm`
    // is REQUIRED on it. A sending message whose confirmation is optional is a
    // sending message with no confirmation.
    const apply = MSG.find((m: any) => 'aim:cag,apply:sync' === pattern(m))
    assert.ok(apply, 'apply:sync is not declared')
    assert.equal(apply.params.confirm, 'Boolean',
      'confirm must be required, not Skip - an optional confirmation is none')

    const proxy = MSG.find((m: any) => 'aim:web,on:cag,apply:sync' === pattern(m))
    assert.ok(proxy, 'the browser cannot reach apply:sync')
  })

  test('known-ABSENT: the send gate and the provider verbs stay unreachable', () => {
    for (const p of patterns()) {
      // These are BELOW apply. Reaching send:invite directly would skip the
      // plan, the confirmation, the cap and the run; reaching a provider verb
      // would skip the ledger gate as well.
      assert.ok(!/send:invite/.test(p), 'the send gate is declared: ' + p)
      assert.ok(!/:extevent/.test(p), 'a provider verb is declared: ' + p)
      assert.ok(!/(acquire|release):lock/.test(p), 'the lock is declared: ' + p)
      assert.ok(!/work:queue|drain:run|enqueue:run/.test(p), 'the queue is declared: ' + p)
    }
  })

  test('known-ABSENT: sys:calendar is not an aim: namespace', () => {
    for (const p of patterns()) {
      assert.ok(!/^aim:calendar/.test(p), p)
      assert.ok(!/sys:calendar/.test(p), 'sys:calendar leaked onto a declared surface: ' + p)
    }
  })
})
