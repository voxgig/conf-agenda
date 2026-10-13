import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const AgendaSrv = require('../../dist/srv/agenda/agenda-srv.js')

const TINY = JSON.parse(
  Fs.readFileSync(Path.join(process.cwd(), 'test/fixtures/tiny/tiny.json'), 'utf8'),
)

const CANONS = ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']

/** The eight entries SPEC 12 names for a snapshot bundle. */
const SECTION_12 = [
  'LICENSE', 'README.md', 'agenda.csv', 'agenda.ics', 'agenda.json',
  'assets/', 'conf-agenda.js', 'index.html',
]

async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  seneca.use(AgendaSrv)
  await seneca.ready()

  for (const canon of CANONS) {
    for (const row of TINY[canon]) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }

  // Resolve the fixture's deliberate clash so the programme can publish.
  const seg = await seneca.entity('cag/fixture').load$('seg_d1edge')
  seg.t_start = 1825239600000 // 11:00
  seg.t_end = 1825243200000 // 12:00
  await seg.save$()

  return seneca
}

async function publish(seneca: any) {
  const pub = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
  assert.equal(pub.ok, true, 'the fixture publishes: ' + JSON.stringify(pub))
}

/** Every stored row, so a test can prove a read wrote nothing. */
async function allRows(seneca: any) {
  const out: any = {}
  for (const canon of [...CANONS, 'cag/snapshot']) {
    out[canon] = (await seneca.entity(canon).list$({}))
      .map((r: any) => r.data$(false))
      .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))
  }
  return out
}

describe('srv-cag-eject', () => {
  test('srv-cag-eject: a published fixture returns all eight SPEC 12 entries', async () => {
    const seneca = await makeSeneca()
    await publish(seneca)

    const out = await seneca.post('aim:cag,eject:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, true, JSON.stringify(out.why))
    assert.equal(out.mode, 'snapshot')
    assert.deepEqual(Object.keys(out.manifest).sort(), SECTION_12)
    assert.ok(0 < out.manifest['conf-agenda.js'].length, 'the component is carried')
    assert.match(out.manifest['agenda.ics'], /BEGIN:VCALENDAR/)

    await seneca.close()
  })

  test('srv-cag-eject: a conference that never published is refused, and nothing is written', async () => {
    const seneca = await makeSeneca()
    const before = await allRows(seneca)

    const out = await seneca.post('aim:cag,eject:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'not-published', 'the word get:feed already uses')
    assert.equal(out.manifest, undefined)

    // Known-present: the rows exist, so "unchanged" is not comparing empties.
    assert.ok(0 < before['cag/fixture'].length)
    assert.deepEqual(before['cag/snapshot'], [], 'never published')
    assert.deepEqual(await allRows(seneca), before, 'eject never publishes on the organiser\'s behalf')

    await seneca.close()
  })

  test('srv-cag-eject: the bundle carries the PUBLISHED time, not a later edit', async () => {
    const seneca = await makeSeneca()
    await publish(seneca)

    const published = (await seneca.entity('cag/fixture').load$('seg_d1edge')).t_start

    // Move the session without republishing.
    const seg = await seneca.entity('cag/fixture').load$('seg_d1edge')
    seg.t_start = published + 3600000
    seg.t_end = seg.t_start + 3600000
    await seg.save$()
    assert.notEqual((await seneca.entity('cag/fixture').load$('seg_d1edge')).t_start, published)

    const out = await seneca.post('aim:cag,eject:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, true)
    const session = JSON.parse(out.manifest['agenda.json']).sessions
      .find((s: any) => 'seg_d1edge' === s.id)
    assert.ok(session, 'the moved session is in the bundle')
    assert.equal(session.t_start, published)

    await seneca.close()
  })

  test('srv-cag-eject: an unknown mode is refused, naming it, with no manifest', async () => {
    const seneca = await makeSeneca()
    await publish(seneca)

    const out = await seneca.post('aim:cag,eject:fixture', { fixture_id: 'conf_tiny', mode: 'zip' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'unknown-mode')
    assert.equal(out.mode, 'zip')
    assert.deepEqual(out.modes, ['snapshot', 'detached'])
    assert.equal(out.manifest, undefined)

    await seneca.close()
  })

  test('srv-cag-eject: no speaker email survives anywhere in the bundle (C6)', async () => {
    const seneca = await makeSeneca()
    await publish(seneca)

    // Known-present: every speaker in the fixture carries an email, so the
    // sweep below is looking for something that exists in the store.
    const emails = TINY['cag/speaker'].map((s: any) => s.email)
    assert.ok(0 < emails.length)
    for (const e of emails) assert.match(e, /@/)

    const out = await seneca.post('aim:cag,eject:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, true)

    // EVERY entry, not a named list: a file added later is swept too.
    const leaks: string[] = []
    for (const [path, content] of Object.entries(out.manifest)) {
      for (const e of emails) {
        if (String(content).includes(e)) leaks.push(path + ': ' + e)
      }
    }
    assert.deepEqual(leaks, [], 'speaker email in the bundle')

    await seneca.close()
  })
})
