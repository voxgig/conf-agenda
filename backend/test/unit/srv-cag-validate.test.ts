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

describe('aim:cag,validate:fixture', () => {
  test('finds the deliberate clash in the tiny conference', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })

    assert.equal(out.ok, true, 'the action ran')
    assert.equal(out.valid, false, 'the programme is NOT publishable')
    assert.equal(out.error_count, 1, 'one blocking error')
    assert.ok(out.warn_count > 0, 'and warnings, which do not block')
    assert.equal(out.top_id, 'conf_tiny')

    // Errors sort FIRST: they are what the organiser must act on.
    const d = out.diagnostics[0]
    assert.equal(d.severity, 'error')
    assert.equal(d.rule, 'room-double-booked')
    assert.match(d.message, /Room A/)
    assert.match(d.message, /overlap by 30 min/)

    await seneca.close()
  })

  test('a clean programme validates', async () => {
    const seneca = await makeSeneca()

    // Move the clashing talk to start when the one before it ends - touching,
    // not overlapping. (Moving it to Room B instead would NOT work: Coffee is
    // already there at 11:00, which the rule correctly catches.)
    const seg = await seneca.entity('cag/fixture').load$('seg_d1edge')
    seg.t_start = 1825239600000 // 11:00
    seg.t_end = 1825243200000 // 12:00
    await seg.save$()

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.valid, true)
    assert.equal(out.error_count, 0, 'valid means NO ERRORS - warnings are allowed')
    assert.ok(
      out.diagnostics.every((d: any) => 'warn' === d.severity),
      'anything left is advisory',
    )

    await seneca.close()
  })

  test('rules read EFFECTIVE status, not the node\'s own', async () => {
    const seneca = await makeSeneca()

    // Cancel the CONFERENCE. Both clashing talks stay `confirmed` on their own
    // rows, but are effectively cancelled - so the clash must disappear. If
    // this fails, the resolver is reading node fields and one confirmed child
    // under an unfinished parent would leak the same way into public output.
    const conf = await seneca.entity('cag/fixture').load$('conf_tiny')
    conf.status = 'cancelled'
    await conf.save$()

    const talk = await seneca.entity('cag/fixture').load$('seg_buses')
    assert.equal(talk.status, 'confirmed', 'the node itself is still confirmed')

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.valid, true, 'a cancelled conference cannot double-book its rooms')

    await seneca.close()
  })

  test('an unknown fixture is refused, not silently valid', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'nope' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'not-found')
    // Critically: NOT `valid: true`. A missing conference must never look
    // publishable.
    assert.notEqual(out.valid, true)

    await seneca.close()
  })

  test('the message shape is enforced by the model', async () => {
    const seneca = await makeSeneca()

    // params: { fixture_id: 'String' } is attached at dispatch, so a bad body
    // is a structured refusal rather than an action-local if.
    await assert.rejects(
      async () => seneca.post('aim:cag,validate:fixture', { fixture_id: 42 }),
      'a non-string fixture_id is refused before the action runs',
    )

    await seneca.close()
  })
})
