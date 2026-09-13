import { test, describe } from 'node:test'
import assert from 'node:assert'

import Model from '../../../../model/model.json'


// THE BROWSER SURFACE.
//
// A browser may only send aim:web messages: the gateway allow-list in
// src/env/web/web.ts names that one namespace, and every message the SPA
// sends is declared in the model as an aim:web proxy that forwards to the
// real service message. These tests pin that contract from the model
// itself, so widening the surface cannot pass unnoticed.

const MSG: any = (Model as any).main.msg.aim
const SRV: any = (Model as any).main.srv


// Every leaf message pattern under a subtree.
function leaves(node: any, path: string[] = []): string[][] {
  const keys = Object.keys(node || {}).filter((k) => '$' !== k)
  if (0 === keys.length) {
    return [path]
  }
  const out: string[][] = []
  for (const k of keys) {
    if (node[k] && 'object' === typeof node[k]) {
      out.push(...leaves(node[k], [...path, k]))
    }
  }
  return out
}


describe('browser surface', () => {

  test('the gateway allows aim:web and nothing else', () => {
    const src = require('node:fs').readFileSync(
      __dirname + '/../../../../src/env/web/web.ts', 'utf8')

    // The allow-list is a literal so it can be read off the source and
    // reviewed: no computed expansion over the service list.
    const m = src.match(/allow:\s*\{([^}]*)\}/)
    assert.ok(m, 'gateway allow-list not found')
    const keys = m[1].match(/'([^']+)'/g) || []
    assert.deepStrictEqual(keys, ["'aim:web'"])
  })


  test('every browser message is a declared aim:web proxy', () => {
    const web = MSG.web
    assert.ok(web, 'no aim:web messages declared')

    // Each proxy names the action file that forwards it: proxies are
    // explicit, never implicit pass-through.
    for (const path of leaves(web.on || {})) {
      const node = path.reduce((n: any, k: string) => n[k], web.on)
      const file = node && node.$ && node.$.file
      assert.ok(file, 'aim:web,on:' + path.join(',') + ' has no proxy action file')
      assert.ok(String(file).includes('web_'),
        'proxy action should be a web_ file: ' + file)
    }
  })


  test('service namespaces are not part of the browser surface', () => {
    // Every service in the model owns a message namespace of its own...
    const services = Object.keys(SRV)
    assert.ok(0 < services.length)
    for (const name of services) {
      assert.ok(MSG[name], 'expected service messages for aim:' + name)
      // ...which is NOT the browser namespace.
      assert.notStrictEqual(name, 'web')
    }

    // ...and no service declares that it accepts the aim:web namespace
    // wholesale: each names only the proxy subtree it owns.
    for (const name of Object.keys(SRV)) {
      const inweb = SRV[name].in && SRV[name].in.aim && SRV[name].in.aim.web
      if (null == inweb) {
        continue
      }
      assert.deepStrictEqual(Object.keys(inweb), ['on'],
        'srv ' + name + ' should only claim aim:web,on:<subtree>')
      const owned = Object.keys(inweb.on)
      assert.ok(0 < owned.length)
    }
  })


  test('the entity service is reachable only through its proxies', () => {
    const ent = MSG.web.on.ent
    assert.ok(ent, 'no aim:web,on:ent proxies')

    // Every command the generic entity service answers has a proxy, so
    // the SPA never needs to post aim:ent directly.
    const commands = Object.keys(MSG.ent.cmd).sort()
    assert.deepStrictEqual(Object.keys(ent.cmd).sort(), commands)
  })


  test('the REST API namespace is not browser-reachable', () => {
    // aim:api is the API-key clients' proxy layer, reached through the
    // REST router - it must not appear in the browser surface.
    assert.strictEqual(MSG.web.on.api, undefined)
    assert.ok(MSG.api, 'aim:api messages should still exist for the router')
  })
})
