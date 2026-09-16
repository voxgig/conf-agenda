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

async function makeSeneca(clean = true) {
  const seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  seneca.use(AgendaSrv)
  await seneca.ready()

  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of TINY[canon]) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }

  if (clean) {
    // Resolve the fixture's deliberate clash so the programme can publish.
    const seg = await seneca.entity('cag/fixture').load$('seg_d1edge')
    seg.t_start = 1825239600000 // 11:00
    seg.t_end = 1825243200000 // 12:00
    await seg.save$()
  }
  return seneca
}

describe('publish and the public read path', () => {
  test('publication is BLOCKED while a validation error remains', async () => {
    const seneca = await makeSeneca(false) // leave the clash in

    const out = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'validation-failed')
    assert.equal(out.error_count, 1)
    assert.ok(out.diagnostics.length > 0, 'and says what is wrong')

    // Nothing was written: an invalid programme must leave no snapshot behind.
    const snap = await seneca.entity('cag/snapshot').load$('org_tiny:tiny-conf-2027')
    assert.equal(snap, null)

    await seneca.close()
  })

  test('a clean programme publishes and is then readable anonymously', async () => {
    const seneca = await makeSeneca()

    const pub = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(pub.ok, true)
    assert.equal(pub.slug, 'tiny-conf-2027')
    assert.equal(pub.session_count, 4)

    const got = await seneca.post('aim:agenda,get:agenda', {
      org_id: 'org_tiny',
      slug: 'tiny-conf-2027',
    })
    assert.equal(got.ok, true)
    assert.equal(got.schema_version, 1)
    assert.equal(got.agenda.conference.title, 'Tiny Conf 2027')
    assert.equal(got.agenda.sessions.length, 4)
    assert.equal(got.agenda.speakers.length, 3)

    await seneca.close()
  })

  test('no speaker email survives the round trip', async () => {
    const seneca = await makeSeneca()
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    const got = await seneca.post('aim:agenda,get:agenda', {
      org_id: 'org_tiny',
      slug: 'tiny-conf-2027',
    })

    const json = JSON.stringify(got.agenda)
    assert.ok(!json.includes('example.invalid'), 'no address from the fixture')
    assert.ok(!json.includes('@'), 'no address at all')

    await seneca.close()
  })

  test('the public path reads the SNAPSHOT, not live rows', async () => {
    const seneca = await makeSeneca()
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    // Edit a session after publishing. The public agenda must not move until
    // the organiser publishes again - that is what makes it cacheable, and
    // what stops an in-progress edit leaking.
    const seg = await seneca.entity('cag/fixture').load$('seg_keynote')
    seg.title = 'EDITED AFTER PUBLISH'
    await seg.save$()

    const got = await seneca.post('aim:agenda,get:agenda', {
      org_id: 'org_tiny',
      slug: 'tiny-conf-2027',
    })
    assert.ok(!JSON.stringify(got.agenda).includes('EDITED AFTER PUBLISH'))

    // Republish, and now it moves.
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    const again = await seneca.post('aim:agenda,get:agenda', {
      org_id: 'org_tiny',
      slug: 'tiny-conf-2027',
    })
    assert.ok(JSON.stringify(again.agenda).includes('EDITED AFTER PUBLISH'))

    await seneca.close()
  })

  test('republishing overwrites in place - never two candidate snapshots', async () => {
    const seneca = await makeSeneca()

    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })

    const all = await seneca.entity('cag/snapshot').list$({ org_id: 'org_tiny' })
    assert.equal(all.length, 1)

    await seneca.close()
  })

  test('an unpublished conference is not-published, not empty', async () => {
    const seneca = await makeSeneca()

    const got = await seneca.post('aim:agenda,get:agenda', {
      org_id: 'org_tiny',
      slug: 'never-published',
    })
    assert.equal(got.ok, false)
    assert.equal(got.why, 'not-published')
    // Not an empty agenda: the embed must be able to tell "no such conference"
    // from "a conference with no sessions" and degrade honestly (SPEC 11.2).
    assert.equal(got.agenda, undefined)

    await seneca.close()
  })

  test('a draft conference cannot be published at all', async () => {
    const seneca = await makeSeneca()

    const conf = await seneca.entity('cag/fixture').load$('conf_tiny')
    conf.status = 'draft'
    await conf.save$()

    const out = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, false)
    assert.equal(out.why, 'not-publishable')

    await seneca.close()
  })

  test('publishing twice gives byte-identical agenda payloads', async () => {
    const seneca = await makeSeneca()

    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    const snap1 = await seneca.entity('cag/snapshot').load$('org_tiny:tiny-conf-2027')
    const first = snap1.agenda_json

    await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    const snap2 = await seneca.entity('cag/snapshot').load$('org_tiny:tiny-conf-2027')
    const second = snap2.agenda_json

    assert.equal(first, second, 'the content hash depends on this (SPEC 17)')
    assert.ok('string' === typeof first, 'the snapshot is stored as bytes, not an object')

    await seneca.close()
  })
})

describe('load:tree publish state', () => {
  // The agenda header reads "Published 2h ago · 3 unpublished changes". Both
  // halves come from real data, and the difference between "never published"
  // and "published, nothing changed since" has to survive - they are different
  // facts and the organiser acts differently on each.

  test('a conference that has never published reports null, not zero', async () => {
    const seneca = await makeSeneca()

    const out = await seneca.post('aim:cag,load:tree', { fixture_id: 'conf_tiny' })
    assert.equal(out.ok, true)
    assert.equal(out.publish.published_at, null)
    // Never published means EVERY segment is unpublished, which is not the
    // same claim as "no changes".
    assert.equal(out.publish.unpublished, out.segments.length)
    assert.ok(0 < out.publish.unpublished)

    await seneca.close()
  })

  test('after publishing, an edited segment is counted and the rest are not', async () => {
    const seneca = await makeSeneca()

    const pub = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
    assert.equal(pub.ok, true)

    const clean = await seneca.post('aim:cag,load:tree', { fixture_id: 'conf_tiny' })
    assert.ok(null != clean.publish.published_at)
    assert.equal(clean.publish.unpublished, 0)

    // Touch one segment with a modification stamp after the snapshot.
    const seg = await seneca.entity('cag/fixture').load$('seg_keynote')
    seg.t_m = (clean.publish.published_at as number) + 1000
    await seg.save$()

    const dirty = await seneca.post('aim:cag,load:tree', { fixture_id: 'conf_tiny' })
    assert.equal(dirty.publish.unpublished, 1)

    await seneca.close()
  })
})
