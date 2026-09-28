/* aim:cag,plan:publish - what publishing would change (SPEC 13.1).
 *
 * The rule this file defends: the diff is between the snapshot publishing
 * WOULD write and the one stored, not between the live tree and a timestamp.
 * That is what makes a draft silent and a title edit honest about being a
 * title edit, and it is the reason buildAgenda answers every question about
 * what is publishable rather than this action restating its rules.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const { publishDiff } = require('../../dist/lib/publish_diff.js')

const TINY = JSON.parse(Fs.readFileSync(
  Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'))

async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 9999, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  await seneca.ready()
  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of TINY[canon] || []) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  return seneca
}

const plan = (seneca: any) =>
  seneca.post('aim:cag,plan:publish', { fixture_id: 'conf_tiny' })

/**
 * Tiny carries a deliberate room clash, so it cannot publish. These tests are
 * about the DIFF, so clear it first.
 *
 * In TIME, not into the other room: room_b already holds the coffee break over
 * the same interval, so moving there just swaps one clash for another. The
 * fixture is small on purpose and there is no spare slot; this pushes
 * seg_d1edge to start where seg_buses ends, which is legal because overlap is
 * half-open (touching is not overlapping).
 */
async function publishable(seneca: any) {
  const buses = await seneca.entity('cag/fixture').load$('seg_buses')
  const row = await seneca.entity('cag/fixture').load$('seg_d1edge')
  await row.data$({ t_start: buses.t_end, t_end: buses.t_end + 3600000 }).save$()
}

const verbs = (out: any) => out.changes.map((c: any) => c.verb)
const byId = (out: any, id: string) => out.changes.find((c: any) => c.fixture_id === id)


describe('aim:cag,plan:publish', () => {
  test('a conference that has never published reports every session as added', async () => {
    // "Never published" and "nothing changed" are different facts. Reporting
    // zero changes here would tell an organiser their first publish is a no-op.
    const seneca = await makeSeneca()
    const out = await plan(seneca)

    assert.equal(out.ok, true, out.why)
    assert.equal(out.published_at, null)
    assert.ok(0 < out.changes.length)
    assert.deepEqual([...new Set(verbs(out))], ['added'])
    assert.match(out.changes[0].detail, /first publish/)

    await seneca.close()
  })

  test('published and untouched reports NO changes', async () => {
    const seneca = await makeSeneca()
    await publishable(seneca)

    const pub = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(pub.ok, true, pub.why)

    const out = await plan(seneca)
    assert.equal(out.published_at !== null, true)
    assert.deepEqual(out.changes, [])

    await seneca.close()
  })

  test('a moved session reports `moved`, and names where it went', async () => {
    const seneca = await makeSeneca()
    await publishable(seneca)
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    const before = await seneca.entity('cag/fixture').load$('seg_buses')
    await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_buses', room_id: 'room_b', t_start: before.t_start + 3600000,
    })

    const out = await plan(seneca)
    const hit = byId(out, 'seg_buses')
    assert.ok(hit, 'the moved session is not in the diff: ' + JSON.stringify(out.changes))
    assert.equal(hit.verb, 'moved')
    // A ROOM NAME, not a room id. A confirmation reading `room_b` is a
    // database row; one reading "Room B" is a sentence.
    assert.match(hit.detail, /Room B/)

    await seneca.close()
  })

  test('a room change alone reports `room`', async () => {
    const seneca = await makeSeneca()
    await publishable(seneca)
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    const before = await seneca.entity('cag/fixture').load$('seg_keynote')
    await seneca.post('aim:cag,move:segment', {
      fixture_id: 'seg_keynote', room_id: 'room_b', t_start: before.t_start,
    })

    const hit = byId(await plan(seneca), 'seg_keynote')
    assert.equal(hit.verb, 'room')

    await seneca.close()
  })

  test('a cancellation reports `cancelled`, not `room` or `edited`', async () => {
    // CANCELLATION IS CHECKED FIRST, the same ordering the calendar
    // reconciliation is built on: a cancelled session keeps its slot and its
    // times, so nothing else about it need have changed. "Room" as the
    // headline on a talk that has been called off is the wrong story.
    const seneca = await makeSeneca()
    await publishable(seneca)
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    await seneca.post('aim:cag,set:status', {
      fixture_id: 'seg_keynote', status: 'cancelled',
    })

    const hit = byId(await plan(seneca), 'seg_keynote')
    assert.equal(hit.verb, 'cancelled')
    // SPEC 9.1: it stays visible, marked cancelled. An organiser about to
    // publish should be told that rather than assuming it vanishes.
    assert.match(hit.detail, /stays visible/)

    await seneca.close()
  })

  test('a speaker change reports `speaker`, by name', async () => {
    const seneca = await makeSeneca()
    await publishable(seneca)
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    await seneca.post('aim:cag,add:appearance', {
      fixture_id: 'seg_keynote', speaker_id: 'spk_tomas',
    })

    const hit = byId(await plan(seneca), 'seg_keynote')
    assert.equal(hit.verb, 'speaker')
    assert.match(hit.detail, /Ada|Tom/)

    await seneca.close()
  })

  test('a DRAFT session is silent, because it is not going out either way', async () => {
    // The reason the diff compares two snapshots rather than the live tree
    // against published_at: a draft bumps t_m and is not published, so a
    // timestamp-based count reports a change nobody would see.
    const seneca = await makeSeneca()
    await publishable(seneca)
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    const made = await seneca.post('aim:cag,make:segment', {
      parent_id: 'conf_tiny', room_id: 'room_b',
      t_start: 1825245000000, t_end: 1825248600000, title: 'Held back',
    })
    assert.equal(made.ok, true, made.why)
    assert.equal(made.item.status, 'draft')

    const out = await plan(seneca)
    assert.deepEqual(out.changes, [],
      'a draft reached the publish diff: ' + JSON.stringify(out.changes))

    // And confirming it makes it appear.
    await seneca.post('aim:cag,set:status', {
      fixture_id: made.item.id, status: 'confirmed',
    })
    assert.deepEqual(verbs(await plan(seneca)), ['added'])

    await seneca.close()
  })

  test('it reports the validation gate rather than failing on submit', async () => {
    // SPEC 16: errors are a hard block on publish. The screen has to be able
    // to say so before the button is pressed.
    const seneca = await makeSeneca()
    const out = await plan(seneca)

    assert.equal(out.valid, false, 'the tiny fixture has a deliberate clash')
    assert.ok(0 < out.error_count)

    await publishable(seneca)
    const clean = await plan(seneca)
    assert.equal(clean.valid, true)
    assert.equal(clean.error_count, 0)

    await seneca.close()
  })

  test('it refuses the same things publish:fixture refuses', async () => {
    const seneca = await makeSeneca()
    const top = await seneca.entity('cag/fixture').load$('conf_tiny')
    await top.data$({ status: 'draft' }).save$()

    const out = await plan(seneca)
    assert.equal(out.ok, false)
    assert.equal(out.why, 'not-publishable')

    await seneca.close()
  })
})


describe('publishDiff', () => {
  // The pure half, where the orderings are cheap to pin.
  const s = (o: any) => ({ id: 'a', title: 'A', t_start: 100, t_end: 200, status: 'confirmed',
    room: 'r1', track: null, speakers: [], ...o })
  const snap = (sessions: any[]) => ({
    sessions,
    rooms: [{ id: 'r1', name: 'Room One' }, { id: 'r2', name: 'Room Two' }],
    tracks: [{ id: 't1', name: 'Track One' }],
    speakers: [{ id: 'sp1', name: 'Ada' }],
  })

  test('a session that stops being published reports `removed`', () => {
    const out = publishDiff(snap([s({})]), snap([]))
    assert.deepEqual(out.map((c: any) => c.verb), ['removed'])
    assert.match(out[0].detail, /no longer appear/)
  })

  test('moved AND rerouted is ONE line, not two', () => {
    // An organiser who dragged a talk to another room at another time did one
    // thing. Two lines about it is a confirmation that overstates the change.
    const out = publishDiff(
      snap([s({})]),
      snap([s({ room: 'r2', t_start: 500, t_end: 600 })]),
    )
    assert.equal(out.length, 1)
    assert.equal(out[0].verb, 'moved')
    assert.match(out[0].detail, /Room Two/)
  })

  test('uncancelling reports `restored`', () => {
    const out = publishDiff(
      snap([s({ status: 'cancelled' })]),
      snap([s({ status: 'confirmed' })]),
    )
    assert.deepEqual(out.map((c: any) => c.verb), ['restored'])
  })

  test('a title edit is `edited`, and says so vaguely on purpose', () => {
    // It is last and it is unspecific: pretending a title change is a
    // schedule change is worse than saying "details changed".
    const out = publishDiff(snap([s({})]), snap([s({ title: 'A, revised' })]))
    assert.deepEqual(out.map((c: any) => c.verb), ['edited'])
  })

  test('near-miss: an identical snapshot produces nothing', () => {
    assert.deepEqual(publishDiff(snap([s({})]), snap([s({})])), [])
  })

  test('the order is stable, so two runs read the same', () => {
    const before = snap([s({ id: 'b', title: 'B' }), s({ id: 'a', title: 'A' })])
    const after = snap([
      s({ id: 'a', title: 'A', room: 'r2' }),
      s({ id: 'b', title: 'B', room: 'r2' }),
    ])
    const once = publishDiff(before, after).map((c: any) => c.fixture_id)
    const twice = publishDiff(before, after).map((c: any) => c.fixture_id)
    assert.deepEqual(once, twice)
    assert.deepEqual(once, ['a', 'b'])
  })
})
