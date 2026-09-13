import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')

const TINY = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'),
)

async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.test()
  basic(seneca)
  await seneca.ready()

  // Seed the tiny conference, preserving ids so the assertions read plainly.
  for (const row of TINY['cag/fixture']) {
    await seneca.entity('cag/fixture').data$({ ...row, id$: row.id }).save$()
  }
  return seneca
}

describe('concern:fixture over the bus', () => {
  test('the concern is loaded, and has no aim: surface', async () => {
    const seneca = await makeSeneca()

    assert.ok(seneca.find_plugin('FixtureTree'), 'loaded in shared setup')
    // A concern is never gateway- or API-reachable (PLATFORM 1.5).
    assert.equal(seneca.find('aim:fixture'), null)

    await seneca.close()
  })

  test('resolve:effective on a clean tree', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('concern:fixture,resolve:effective', {
      fixture_id: 'seg_keynote',
    })
    assert.equal(out.ok, true)
    assert.equal(out.status, 'confirmed')
    assert.equal(out.private, false)
    assert.deepEqual(out.chain, ['conf_tiny'])
    assert.equal(out.broken, false)

    await seneca.close()
  })

  test('a draft conference makes every segment under it draft', async () => {
    const seneca = await makeSeneca()

    const conf = await seneca.entity('cag/fixture').load$('conf_tiny')
    conf.status = 'draft'
    await conf.save$()

    for (const id of ['seg_keynote', 'seg_buses', 'seg_coffee']) {
      const out = await seneca.post('concern:fixture,resolve:effective', { fixture_id: id })
      assert.equal(out.status, 'draft', `${id} inherits draft from the conference`)
    }

    await seneca.close()
  })

  test('a private conference makes every segment under it private', async () => {
    const seneca = await makeSeneca()

    const conf = await seneca.entity('cag/fixture').load$('conf_tiny')
    conf.private = true
    await conf.save$()

    const out = await seneca.post('concern:fixture,resolve:effective', {
      fixture_id: 'seg_buses',
    })
    assert.equal(out.private, true)

    await seneca.close()
  })

  test('resolve:top and list:ancestors', async () => {
    const seneca = await makeSeneca()

    const top = await seneca.post('concern:fixture,resolve:top', { fixture_id: 'seg_coffee' })
    assert.equal(top.top_id, 'conf_tiny')

    const ownTop = await seneca.post('concern:fixture,resolve:top', { fixture_id: 'conf_tiny' })
    assert.equal(ownTop.top_id, 'conf_tiny', 'a root is its own top')

    const anc = await seneca.post('concern:fixture,list:ancestors', { fixture_id: 'seg_coffee' })
    assert.deepEqual(anc.list.map((n: any) => n.id), ['conf_tiny'])

    await seneca.close()
  })

  test('list:subtree finds every segment - what C8 needs before a delete', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('concern:fixture,list:subtree', { fixture_id: 'conf_tiny' })
    assert.deepEqual(
      out.list.map((n: any) => n.id).sort(),
      ['seg_buses', 'seg_coffee', 'seg_d1edge', 'seg_keynote'],
      'deleting the conference must reach all four to cancel their events',
    )

    const leaf = await seneca.post('concern:fixture,list:subtree', { fixture_id: 'seg_buses' })
    assert.deepEqual(leaf.list, [])

    await seneca.close()
  })

  test('check:cycle refuses a descendant as parent, allows a real move', async () => {
    const seneca = await makeSeneca()

    const bad = await seneca.post('concern:fixture,check:cycle', {
      fixture_id: 'conf_tiny',
      parent_id: 'seg_buses',
    })
    assert.equal(bad.ok, false)
    assert.equal(bad.cycle, true)
    assert.equal(bad.why, 'fixture-cycle')

    const self = await seneca.post('concern:fixture,check:cycle', {
      fixture_id: 'seg_buses',
      parent_id: 'seg_buses',
    })
    assert.equal(self.cycle, true, 'a node cannot be its own parent')

    const good = await seneca.post('concern:fixture,check:cycle', {
      fixture_id: 'seg_buses',
      parent_id: 'conf_tiny',
    })
    assert.equal(good.ok, true)
    assert.equal(good.cycle, false)

    await seneca.close()
  })

  test('an unknown fixture is not-found, not a silent default', async () => {
    const seneca = await makeSeneca()

    for (const pat of ['resolve:effective', 'resolve:top', 'list:ancestors', 'list:subtree']) {
      const out = await seneca.post('concern:fixture,' + pat, { fixture_id: 'nope' })
      assert.equal(out.ok, false, pat)
      assert.equal(out.why, 'not-found', pat)
    }

    await seneca.close()
  })
})
