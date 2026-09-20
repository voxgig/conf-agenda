/* The segment intents (SPEC 9): the grid's mutations as named messages.
 *
 * What is being defended here, in order of how much it would cost to get
 * wrong:
 *
 *   1. TENANCY NEVER COMES FROM THE PAYLOAD. A real flaw in todo-app, and
 *      SPEC 13.2 says plainly: do not reintroduce it. Both halves are
 *      asserted - the row that was named is unchanged, AND the row in the
 *      other org is untouched. A known-present assertion alone is vacuous,
 *      and the browser-surface test went vacuously green once already.
 *   2. THE SAVE-TIME GUARDS. cycle, bad-parent-kind and cross-tenant refuse
 *      BEFORE storing. After storing, a cycle makes every tree resolver
 *      recurse for ever.
 *   3. EDITING IS NOT GATED BY VALIDATION. A move that creates a clash still
 *      saves. Validation gates publish and apply:sync (SPEC 16); an organiser
 *      rebuilding a schedule has to be able to pass through an invalid state.
 *   4. UNDO IS AN INVERSE, NOT A REWIND.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const { saveRow } = require('../../dist/srv/cag/intent_util.js')

const TINY = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'),
)

const MSG: any[] = (Model as any).main.msg
const pattern = (m: any) =>
  m.pat.map((p: any) => Object.entries(p)[0].join(':')).join(',')

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
  // A second organisation, so cross-tenant is a thing that can be attempted
  // rather than a thing that is merely asserted about.
  await seneca.entity('cag/room').data$({
    id$: 'room_other', org_id: 'org_other', name: 'Someone else’s room',
  }).save$()
  await seneca.entity('cag/fixture').data$({
    id$: 'conf_other', org_id: 'org_other', kind: 'con', title: 'Other Conf',
    slug: 'other-conf', t_start: 1825230600000, t_end: 1825261200000,
  }).save$()
  return seneca
}

const load = (seneca: any, canon: string, id: string) =>
  seneca.entity(canon).load$(id).then((r: any) => (null == r ? null : r.data$(false)))


describe('move:segment', () => {
  test('moves the session, and returns the inverse arguments', async () => {
    const seneca = await makeSeneca()
    const before = await load(seneca, 'cag/fixture', 'seg_buses')

    const out = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses', room_id: 'room_b', t_start: before.t_start + 3600000,
    })

    assert.equal(out.ok, true, out.why)
    assert.equal(out.item.room_id, 'room_b')
    assert.equal(out.item.t_start, before.t_start + 3600000)

    // DURATION IS PRESERVED. The grid hands over a slot, not a span - which
    // is also what makes the inverse exact.
    assert.equal(out.item.t_end - out.item.t_start, before.t_end - before.t_start)

    // Exactly what the declared inverse map reads, and nothing else.
    assert.deepEqual(out.prev, { room_id: before.room_id, t_start: before.t_start })

    await seneca.close()
  })

  test('a move that creates a CLASH still saves', async () => {
    // Validation gates publish, not editing (SPEC 16). The mockup draws
    // exactly this: the card lands, and two cards go red.
    const seneca = await makeSeneca()
    const keynote = await load(seneca, 'cag/fixture', 'seg_keynote')

    const out = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_coffee', room_id: 'room_a', t_start: keynote.t_start,
    })
    assert.equal(out.ok, true, 'editing was gated by validation: ' + out.why)

    const stored = await load(seneca, 'cag/fixture', 'seg_coffee')
    assert.equal(stored.room_id, 'room_a')

    // And the organiser is told, which is the header's error count.
    const check = await seneca.post('aim:cag,validate:fixture', { fixture_id: 'conf_tiny' })
    const rules = check.diagnostics.map((d: any) => d.rule)
    assert.ok(rules.includes('room-double-booked'),
      'the clash was not reported: ' + JSON.stringify(rules))

    await seneca.close()
  })

  test('refuses a room belonging to another organisation', async () => {
    // SPEC 16.1: cross-tenant-reference is checked at SAVE time as well as at
    // validate. Existence is not enough.
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses', room_id: 'room_other', t_start: 1825236000000,
    })
    assert.equal(out.ok, false)
    assert.match(out.why, /^cross-tenant-reference/)

    // Refused BEFORE storing: nothing moved.
    const stored = await load(seneca, 'cag/fixture', 'seg_buses')
    assert.equal(stored.room_id, 'room_a')

    await seneca.close()
  })

  test('refuses a room that does not exist', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses', room_id: 'nope', t_start: 1825236000000,
    })
    assert.equal(out.ok, false)
    assert.match(out.why, /^unknown-reference/)
    await seneca.close()
  })
})


describe('tenancy comes from the stored row', () => {
  test('a payload org_id changes nothing, and reaches nothing', async () => {
    // BOTH HALVES. The named row keeps its org (known-present), and the other
    // org's row is untouched (known-absent). Either alone proves little.
    const seneca = await makeSeneca()
    const otherBefore = await load(seneca, 'cag/fixture', 'conf_other')

    const out = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses',
      t_start: 1825236000000,
      // Not in the declared params shape, and not read by the action.
      org_id: 'org_other',
      owner_id: 'someone_else',
    } as any)
    assert.equal(out.ok, true, out.why)

    const moved = await load(seneca, 'cag/fixture', 'seg_buses')
    assert.equal(moved.org_id, 'org_tiny', 'the payload moved a row between orgs')

    const otherAfter = await load(seneca, 'cag/fixture', 'conf_other')
    assert.deepEqual(otherAfter, otherBefore, 'a row in another org was touched')

    await seneca.close()
  })

  test('saveRow re-pins the org even when handed one', async () => {
    // THE LAYERS ARE PINNED SEPARATELY, ON PURPOSE.
    //
    // The end-to-end test above only fails when BOTH defences break: the
    // action builds `changes` from named fields, so a payload org_id never
    // reaches the save, and saveRow re-pins from the stored row even if one
    // does. Verified by reverting each in turn - neither alone flips it.
    //
    // That is good layering and a bad test, because a defence nothing fails
    // over is a defence that gets deleted in a refactor. So this reaches past
    // the action and hands saveRow the thing it exists to ignore.
    const seneca = await makeSeneca()
    const row = await seneca.entity('cag/fixture').load$('seg_buses')

    const saved = await saveRow(seneca, row, {
      title: 'Renamed', org_id: 'org_other', owner_id: 'someone_else',
    })
    assert.equal(saved.title, 'Renamed', 'the legitimate change did not land')
    assert.equal(saved.org_id, 'org_tiny', 'saveRow let a caller move a row between orgs')

    await seneca.close()
  })

  test('a new segment inherits the org of its parent, not of the caller', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,make:segment', {
      parent_id: 'conf_tiny',
      t_start: 1825245000000,
      t_end: 1825248600000,
      org_id: 'org_other',
    } as any)
    assert.equal(out.ok, true, out.why)
    assert.equal(out.item.org_id, 'org_tiny')
    assert.equal(out.item.top_id, 'conf_tiny')
    // A new session is a DRAFT until somebody says otherwise.
    assert.equal(out.item.status, 'draft')

    await seneca.close()
  })
})


describe('the save-time guards refuse BEFORE storing', () => {
  test('bad-parent-kind: a segment cannot sit under a segment', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,make:segment', {
      parent_id: 'seg_keynote', kind: 'tak',
      t_start: 1825245000000, t_end: 1825248600000,
    })
    assert.equal(out.ok, false)
    assert.match(out.why, /^bad-parent-kind/)

    const made = await seneca.entity('cag/fixture').list$({ parent_id: 'seg_keynote' })
    assert.equal(made.length, 0, 'the row was stored anyway')

    await seneca.close()
  })

  test('bad-parent-kind: a conference cannot sit under a conference', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,make:segment', {
      parent_id: 'conf_tiny', kind: 'con',
      t_start: 1825245000000, t_end: 1825248600000,
    })
    assert.equal(out.ok, false)
    assert.match(out.why, /^bad-parent-kind/)
    await seneca.close()
  })

  test('negative-duration is refused with a reason, not a shape error', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,make:segment', {
      parent_id: 'conf_tiny', t_start: 1825248600000, t_end: 1825245000000,
    })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'negative-duration')
    await seneca.close()
  })
})


describe('set:status', () => {
  test('sets the status and names the previous one', async () => {
    const seneca = await makeSeneca()
    const before = await load(seneca, 'cag/fixture', 'seg_buses')

    const out = await seneca.post('aim:cag,set:status', {
      fixture_id: 'seg_buses', status: 'confirmed',
    })
    assert.equal(out.ok, true, out.why)
    assert.equal(out.item.status, 'confirmed')
    assert.deepEqual(out.prev, { status: before.status })

    await seneca.close()
  })

  test('refuses a status that is not one of the three', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,set:status', {
      fixture_id: 'seg_buses', status: 'probably',
    })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'bad-status')
    await seneca.close()
  })
})


describe('duplicate:segment', () => {
  test('copies the row AND its appearances, as a draft', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,duplicate:segment', { fixture_id: 'seg_keynote' })
    assert.equal(out.ok, true, out.why)
    assert.notEqual(out.fixture_id, 'seg_keynote')
    assert.equal(out.item.status, 'draft')
    assert.match(out.item.title, /\(copy\)$/)

    // The appearances are the reason this is a message and not a make:segment
    // with the same fields.
    const copied = (await seneca.entity('cag/appearance')
      .list$({ fixture_id: out.fixture_id })).map((r: any) => r.data$(false))
    assert.equal(copied.length, 1)
    assert.equal(copied[0].speaker_id, 'spk_ada')

    // A copy has been sent to nobody. Inheriting `sent` would make the ledger
    // disagree with the calendar about an event that does not exist.
    assert.equal(copied[0].invite, 'none')

    await seneca.close()
  })
})


describe('appearances', () => {
  test('add then remove, each naming the other’s arguments', async () => {
    const seneca = await makeSeneca()

    const added = await seneca.post('aim:cag,add:appearance', {
      fixture_id: 'seg_coffee', speaker_id: 'spk_ada', role: 'host',
    })
    assert.equal(added.ok, true, added.why)
    assert.ok(added.appearance_id)
    assert.equal(added.item.org_id, 'org_tiny')

    const removed = await seneca.post('aim:cag,remove:appearance', {
      appearance_id: added.appearance_id,
    })
    assert.equal(removed.ok, true, removed.why)
    // Read BEFORE the delete: afterwards nothing says who was on it.
    assert.deepEqual(removed.prev, {
      fixture_id: 'seg_coffee', speaker_id: 'spk_ada', role: 'host',
    })

    assert.equal(await load(seneca, 'cag/appearance', added.appearance_id), null)

    await seneca.close()
  })

  test('adding the same speaker twice does not make a second row', async () => {
    // Two appearances for one speaker on one session is two attendee entries
    // and, at the ledger, an event whose attendee set never settles.
    const seneca = await makeSeneca()

    const one = await seneca.post('aim:cag,add:appearance', {
      fixture_id: 'seg_coffee', speaker_id: 'spk_ada',
    })
    const two = await seneca.post('aim:cag,add:appearance', {
      fixture_id: 'seg_coffee', speaker_id: 'spk_ada',
    })
    assert.equal(two.ok, true)
    assert.equal(two.appearance_id, one.appearance_id)

    const rows = await seneca.entity('cag/appearance').list$({ fixture_id: 'seg_coffee' })
    assert.equal(rows.length, 1)

    await seneca.close()
  })

  test('refuses a speaker from another organisation', async () => {
    const seneca = await makeSeneca()
    await seneca.entity('cag/speaker').data$({
      // `email: ''` and not absent: the field carries valid: 'Empty', which
      // permits an empty string but still REQUIRES the key. Both faces of the
      // Skip/Empty trap are live in this model.
      id$: 'spk_other', org_id: 'org_other', name: 'Someone Else', email: '',
    }).save$()

    const out = await seneca.post('aim:cag,add:appearance', {
      fixture_id: 'seg_coffee', speaker_id: 'spk_other',
    })
    assert.equal(out.ok, false)
    assert.match(out.why, /^cross-tenant-reference/)
    await seneca.close()
  })
})


describe('remove:segment', () => {
  test('takes its appearances with it', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,remove:segment', { fixture_id: 'seg_keynote' })
    assert.equal(out.ok, true, out.why)

    assert.equal(await load(seneca, 'cag/fixture', 'seg_keynote'), null)
    const orphans = await seneca.entity('cag/appearance').list$({ fixture_id: 'seg_keynote' })
    assert.equal(orphans.length, 0, 'an appearance outlived its segment')

    await seneca.close()
  })

  test('refuses a fixture that has children', async () => {
    // Removing one here would strand its subtree - the C8 shape of bug.
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,remove:segment', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'has-children')
    await seneca.close()
  })
})


describe('undo is an inverse, not a rewind', () => {
  test('the inverse of a move is an ordinary edit that lands where it started', async () => {
    const seneca = await makeSeneca()
    const before = await load(seneca, 'cag/fixture', 'seg_buses')

    const moved = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses', room_id: 'room_b', t_start: before.t_start + 3600000,
    })

    // Built exactly as web/src/undo.js will build it, from the DECLARED map.
    const def = MSG.find((m: any) => 'aim:cag,move:segment' === pattern(m))
    const args: any = {}
    for (const [k, path] of Object.entries<string>(def.inverse.map)) {
      const [root, ...rest] = path.split('.')
      let v: any = 'params' === root
        ? { fixture_id: 'seg_buses' }
        : moved
      for (const step of rest) v = v[step]
      args[k] = v
    }

    const undone = await seneca.post('aim:cag,move:segment', args)
    assert.equal(undone.ok, true, undone.why)

    const after = await load(seneca, 'cag/fixture', 'seg_buses')
    assert.equal(after.room_id, before.room_id)
    assert.equal(after.t_start, before.t_start)
    assert.equal(after.t_end, before.t_end)

    // AND IT WAS AN ORDINARY EDIT. The undo's own `prev` names where the
    // segment had been MOVED TO - it is a second forward edit, not a rewind,
    // so the ledger, the validator and the audit trail see two of them.
    assert.deepEqual(undone.prev, { room_id: 'room_b', t_start: before.t_start + 3600000 })

    await seneca.close()
  })

  test('every declared inverse map reads a path the result actually has', async () => {
    // Walked from the model rather than hardcoded, so an action that stops
    // returning a field its inverse map names fails HERE rather than the
    // first time an organiser presses `u`.
    const seneca = await makeSeneca()

    const made = await seneca.post('aim:cag,make:segment', {
      parent_id: 'conf_tiny', t_start: 1825245000000, t_end: 1825248600000,
    })
    const added = await seneca.post('aim:cag,add:appearance', {
      fixture_id: 'seg_coffee', speaker_id: 'spk_ada',
    })
    const moved = await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses', room_id: 'room_b', t_start: 1825239600000,
    })
    const statused = await seneca.post('aim:cag,set:status', {
      fixture_id: 'seg_buses', status: 'confirmed',
    })
    const removedApp = await seneca.post('aim:cag,remove:appearance', {
      appearance_id: added.appearance_id,
    })

    const results: Record<string, any> = {
      'aim:cag,make:segment': made,
      'aim:cag,duplicate:segment': made,
      'aim:cag,move:segment': moved,
      'aim:cag,set:status': statused,
      'aim:cag,add:appearance': added,
      'aim:cag,remove:appearance': removedApp,
    }

    let checked = 0
    for (const m of MSG) {
      if (null == m.inverse) continue
      const result = results[pattern(m)]
      assert.ok(result, 'no result captured for ' + pattern(m))
      for (const [key, path] of Object.entries<string>(m.inverse.map || {})) {
        if (!path.startsWith('result.')) continue
        let v: any = result
        for (const step of path.split('.').slice(1)) {
          assert.ok(null != v, pattern(m) + ' inverse map ' + key + ' reads ' + path +
            ', which the result does not carry')
          v = v[step]
        }
        assert.ok(null != v, pattern(m) + ': ' + path + ' resolved to null')
        checked++
      }
    }
    assert.ok(0 < checked, 'no inverse map was actually walked')

    await seneca.close()
  })
})
