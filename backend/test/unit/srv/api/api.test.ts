import { test, describe } from 'node:test'
import assert from 'node:assert'

import Model from '../../../../model/model.json'


// THE GENERIC REST ENTITY SERVICE IS ABSENT.
//
// This file is create-once @voxgig/build output (env/web/web_gen.js). The
// generated version tested aim:api,on:ent, the generic entity surface SPEC 9
// replaced with named intents, so it was rewritten to pin that the service
// stays gone. Do not delete it: the next model-build writes the generic
// version back, and that version fails.
//
// PLATFORM 10: a known-absent assertion needs a known-present one beside it,
// or an empty or reshaped model passes it for free.

const SRV: any = (Model as any).main.srv
const MSG: any[] = (Model as any).main.msg

const pattern = (m: any) =>
  m.pat.map((p: any) => Object.entries(p)[0].join(':')).join(',')


describe('api service', () => {

  test('known-PRESENT: the model declares the cag service', () => {
    assert.ok(SRV && 'object' === typeof SRV, 'main.srv is a map')
    assert.ok(SRV.cag, 'cag is declared in main.srv')
  })


  test('known-ABSENT: no generic REST entity service is declared', () => {
    assert.strictEqual(SRV.api, undefined, 'api is declared in main.srv')
    assert.ok(Array.isArray(MSG) && 0 < MSG.length, 'main.msg is a non-empty list')
    const api = MSG.map(pattern).filter((p: string) => p.startsWith('aim:api'))
    assert.deepStrictEqual(api, [], 'aim:api messages declared')
  })
})
