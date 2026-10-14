import { test, describe } from 'node:test'
import assert from 'node:assert'

import Seneca from 'seneca'

import Model from '../../../../model/model.json'

const { basic } = require('../../../../dist/env/shared/basic.js')
const CagSrv = require('../../../../dist/srv/cag/cag-srv.js')


// THE GENERIC BROWSER ENTITY PROXIES ARE ABSENT.
//
// This file is create-once @voxgig/build output (env/web/web_gen.js). The
// generated version tested aim:web,on:ent,cmd:*, the generic entity proxies
// SPEC 9 replaced with named intents, so it was rewritten to pin that they
// stay gone. Do not delete it: the next model-build writes the generic
// version back, and that version fails.
//
// browser-surface.test.ts walks the DECLARED messages. This asks a booted
// service what it actually ANSWERS, which only a running seneca can say.

const SRV: any = (Model as any).main.srv


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'cag'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  await seneca.ready()
  return seneca
}


describe('entity browser proxies', () => {

  test('known-PRESENT: the grid read proxy is registered', async () => {
    const seneca = await makeSeneca()
    assert.ok(seneca.has('aim:web,on:cag,load:tree'), 'aim:web,on:cag,load:tree has no action')
    await seneca.close()
  })


  test('known-ABSENT: no generic entity proxy is registered or declared', async () => {
    const seneca = await makeSeneca()
    assert.ok(!seneca.has('aim:web,on:ent,cmd:list'), 'aim:web,on:ent,cmd:list has an action')
    assert.strictEqual(SRV.ent, undefined, 'ent is declared in main.srv')
    await seneca.close()
  })
})
