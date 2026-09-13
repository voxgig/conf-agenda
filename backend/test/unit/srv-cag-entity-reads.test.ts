import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')

const TINY = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'),
)

async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'cag'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  await seneca.ready()
  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of TINY[canon]) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  return seneca
}

describe('per-entity reads', () => {
  test('each entity has its own list and load message', async () => {
    const seneca = await makeSeneca()

    const rooms = await seneca.post('aim:cag,list:room', {})
    assert.equal(rooms.ok, true)
    assert.equal(rooms.list.length, 2)

    const one = await seneca.post('aim:cag,load:room', { id: 'room_a' })
    assert.equal(one.ok, true)
    assert.equal(one.item.name, 'Room A')

    const missing = await seneca.post('aim:cag,load:room', { id: 'nope' })
    assert.equal(missing.ok, false)
    assert.equal(missing.why, 'not-found')

    await seneca.close()
  })

  test('the authenticated admin DOES see speaker emails', async () => {
    // C6 is about the PUBLIC path, enforced structurally in buildAgenda. The
    // organiser owns these emails, and SPEC 16.2's `speaker-no-email` warning
    // is unactionable if the app cannot show which speaker lacks one.
    // Stripping here would look cautious and quietly break a rule.
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,load:speaker', { id: 'spk_ada' })
    assert.equal(out.item.email, 'ada@example.invalid')

    await seneca.close()
  })

  test('the canon is in the PATTERN, so a caller cannot choose one', async () => {
    const seneca = await makeSeneca()

    // There is no message that takes a canon as data - the surface simply does
    // not exist (SPEC 9). A caller naming sys/user gets nothing, because there
    // is nothing to name it to.
    assert.equal(seneca.find('aim:cag,cmd:list'), null)
    assert.equal(seneca.find('aim:web,on:ent,cmd:list'), null)

    // And entities with no declared read have no surface at all - fixture is
    // read through load:tree, which resolves effective status; a raw list would
    // bypass that.
    assert.equal(seneca.find('aim:cag,list:fixture'), null)

    await seneca.close()
  })

  test('reads are key-ordered, so identical reads serialise identically', async () => {
    const seneca = await makeSeneca()

    const a = JSON.stringify((await seneca.post('aim:cag,list:room', {})).list)
    const b = JSON.stringify((await seneca.post('aim:cag,list:room', {})).list)
    assert.equal(a, b)

    await seneca.close()
  })
})
