import { test, describe } from 'node:test'
import assert from 'node:assert'

import { makeSeneca, mockEnt, as, pickEntity } from './api.setup'


const ALICE = { id: 'u01', email: 'alice@ex.com' }

// The entity under test comes from the model, so this suite holds for any
// entity graph (see pickEntity).
const ENT = pickEntity()


describe('api service', () => {

  test('get-info', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:api,get:info')
    assert.strictEqual(out.ok, true)
    assert.strictEqual(out.srv, 'api')
    await seneca.close()
  })


  test('unknown entities, the sys zone and unknown ops are rejected', async () => {
    const ent = mockEnt()
    const seneca = await makeSeneca(ent.install)

    for (const canon of ['nope/nope', 'sys/user', 'sys/apikey']) {
      const out = await as(seneca, ALICE,
        { aim: 'api', on: 'ent', op: 'list', ent: canon })
      assert.strictEqual(out.ok, false, canon)
      assert.strictEqual(out.why, 'unknown-entity', canon)
    }

    if (ENT) {
      const badop = await as(seneca, ALICE,
        { aim: 'api', on: 'ent', op: 'wat', ent: ENT.canon })
      assert.strictEqual(badop.ok, false)
      assert.strictEqual(badop.why, 'unknown-op')
    }

    // Nothing reached the entity service.
    assert.strictEqual(ent.calls.length, 0)
    await seneca.close()
  })


  test('list delegates to the entity service, query included', async (t) => {
    if (!ENT) {
      return t.skip('model exposes no entities')
    }
    const field = ENT.required[0] || ENT.writable[0]
    const rows = [
      Object.assign({ id: 'e01' }, ENT.valid()),
      Object.assign({ id: 'e02' }, ENT.valid(), field ? { [field]: 'other' } : {}),
    ]
    const ent = mockEnt({ [ENT.canon]: rows })
    const seneca = await makeSeneca(ent.install)

    const all = await as(seneca, ALICE,
      { aim: 'api', on: 'ent', op: 'list', ent: ENT.canon })
    assert.strictEqual(all.ok, true)
    assert.strictEqual(all.items.length, 2)
    assert.deepStrictEqual(ent.calls[0], { cmd: 'list', ent: ENT.canon, q: {} })

    if (field) {
      const some = await as(seneca, ALICE, {
        aim: 'api', on: 'ent', op: 'list', ent: ENT.canon,
        q: { [field]: 'other' },
      })
      assert.strictEqual(some.items.length, 1)
      assert.strictEqual(some.items[0].id, 'e02')
    }

    await seneca.close()
  })


  test('load returns the entity, or not-found', async (t) => {
    if (!ENT) {
      return t.skip('model exposes no entities')
    }
    const ent = mockEnt({ [ENT.canon]: [Object.assign({ id: 'e01' }, ENT.valid())] })
    const seneca = await makeSeneca(ent.install)

    const got = await as(seneca, ALICE,
      { aim: 'api', on: 'ent', op: 'load', ent: ENT.canon, id: 'e01' })
    assert.strictEqual(got.ok, true)
    assert.strictEqual(got.item.id, 'e01')

    const missing = await as(seneca, ALICE,
      { aim: 'api', on: 'ent', op: 'load', ent: ENT.canon, id: 'nope' })
    assert.strictEqual(missing.ok, false)
    assert.strictEqual(missing.why, 'not-found')

    await seneca.close()
  })


  test('create validates against the generated shape', async (t) => {
    if (!ENT) {
      return t.skip('model exposes no entities')
    }
    const ent = mockEnt()
    const seneca = await makeSeneca(ent.install)

    const made = await as(seneca, ALICE, {
      aim: 'api', on: 'ent', op: 'create', ent: ENT.canon, data: ENT.valid(),
    })
    assert.strictEqual(made.ok, true)
    assert.ok(made.item.id)

    // The shapes are closed: unknown properties are rejected (strict JSON).
    const extra = await as(seneca, ALICE, {
      aim: 'api', on: 'ent', op: 'create', ent: ENT.canon,
      data: Object.assign(ENT.valid(), { definitely_not_a_field: 1 }),
    })
    assert.strictEqual(extra.ok, false)
    assert.strictEqual(extra.why, 'invalid-data')
    assert.ok(extra.details.some((d: any) => 'closed' === d.what))

    // Server-managed fields are not client-writable either.
    const managed = await as(seneca, ALICE, {
      aim: 'api', on: 'ent', op: 'create', ent: ENT.canon,
      data: Object.assign(ENT.valid(), { owner_id: 'someone-else' }),
    })
    assert.strictEqual(managed.ok, false)
    assert.strictEqual(managed.why, 'invalid-data')

    // A required field left out.
    if (0 < ENT.required.length) {
      const bare = await as(seneca, ALICE,
        { aim: 'api', on: 'ent', op: 'create', ent: ENT.canon, data: {} })
      assert.strictEqual(bare.ok, false)
      assert.strictEqual(bare.why, 'invalid-data')
      assert.ok(bare.details.some((d: any) => 'required' === d.what))
    }

    // A field of the wrong type.
    const wrong = ENT.wrongType()
    if (wrong) {
      const out = await as(seneca, ALICE,
        { aim: 'api', on: 'ent', op: 'create', ent: ENT.canon, data: wrong })
      assert.strictEqual(out.ok, false)
      assert.strictEqual(out.why, 'invalid-data')
      assert.ok(out.details.some((d: any) => 'type' === d.what))
    }

    await seneca.close()
  })


  test('update merges onto the existing entity', async (t) => {
    if (!ENT) {
      return t.skip('model exposes no entities')
    }
    const field = ENT.writable[0]
    if (null == field) {
      return t.skip('entity has no writable fields')
    }

    const existing = Object.assign({ id: 'e01' }, ENT.valid())
    const ent = mockEnt({ [ENT.canon]: [existing] })
    const seneca = await makeSeneca(ent.install)

    const patch = { [field]: ENT.patchValue(field) }
    const out = await as(seneca, ALICE, {
      aim: 'api', on: 'ent', op: 'update', ent: ENT.canon, id: 'e01', data: patch,
    })
    assert.strictEqual(out.ok, true)
    assert.strictEqual(out.item.id, 'e01')
    assert.strictEqual(out.item[field], patch[field])

    // Fields not named in a partial update survive it.
    for (const other of ENT.required.filter((f: string) => f !== field)) {
      assert.strictEqual(out.item[other], existing[other], other)
    }

    const missing = await as(seneca, ALICE, {
      aim: 'api', on: 'ent', op: 'update', ent: ENT.canon, id: 'nope', data: patch,
    })
    assert.strictEqual(missing.ok, false)
    assert.strictEqual(missing.why, 'not-found')

    await seneca.close()
  })


  test('remove deletes an existing entity only', async (t) => {
    if (!ENT) {
      return t.skip('model exposes no entities')
    }
    const ent = mockEnt({ [ENT.canon]: [Object.assign({ id: 'e01' }, ENT.valid())] })
    const seneca = await makeSeneca(ent.install)

    const gone = await as(seneca, ALICE,
      { aim: 'api', on: 'ent', op: 'remove', ent: ENT.canon, id: 'e01' })
    assert.strictEqual(gone.ok, true)

    const again = await as(seneca, ALICE,
      { aim: 'api', on: 'ent', op: 'remove', ent: ENT.canon, id: 'e01' })
    assert.strictEqual(again.ok, false)
    assert.strictEqual(again.why, 'not-found')

    await seneca.close()
  })


  test('a failure from the entity service is passed through', async (t) => {
    if (!ENT) {
      return t.skip('model exposes no entities')
    }
    const seneca = await makeSeneca((s: any) => {
      s.message('aim:ent,cmd:list', async () => ({ ok: false, why: 'forbidden' }))
    })

    const out = await as(seneca, ALICE,
      { aim: 'api', on: 'ent', op: 'list', ent: ENT.canon })
    assert.strictEqual(out.ok, false)
    assert.strictEqual(out.why, 'forbidden')
    await seneca.close()
  })
})
