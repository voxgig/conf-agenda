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


describe('the rules that need more than the tree are actually WIRED IN', () => {
  // THE SILENT-SKIP GUARD. bad-color-contrast needs the theme's surfaces and
  // the asset rules need a filesystem checker; both return [] when they are
  // not given one. That is the right behaviour for a pure function and the
  // wrong thing to discover in production, so this asserts the SERVICE
  // supplies them - the unit tests only prove the rules work when they are.

  test('bad-color-contrast fires through validate:fixture', async () => {
    const seneca = await makeSeneca()
    // vox-teal: 2.1:1 on the light card surface.
    const track = (await seneca.entity('cag/track').list$({}))[0]
    await track.data$({ color: '#00c6d8' }).save$()

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })
    const found = out.diagnostics.filter((d: any) => 'bad-color-contrast' === d.rule)
    assert.equal(found.length, 1,
      'the rule never ran - the service is not passing the theme surfaces')
    assert.equal(found[0].severity, 'error')

    await seneca.close()
  })

  test('broken-asset fires through validate:fixture', async () => {
    const seneca = await makeSeneca()
    const sp = (await seneca.entity('cag/speaker').list$({}))[0]
    await sp.data$({ photo: 'definitely-not-here.jpg' }).save$()

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })
    assert.ok(out.diagnostics.some((d: any) => 'broken-asset' === d.rule),
      'the rule never ran - the service is not passing an asset checker')

    await seneca.close()
  })

  test('fixture-cycle fires through validate:fixture', async () => {
    // The runtime pair of the save-time guard: data that already has a cycle,
    // which check:cycle can only prevent, not repair.
    const seneca = await makeSeneca()
    const row = await seneca.entity('cag/fixture').load$('seg_buses')
    await row.data$({ parent_id: 'seg_buses' }).save$()

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })
    assert.ok(out.diagnostics.some((d: any) => 'fixture-cycle' === d.rule))

    await seneca.close()
  })
})
