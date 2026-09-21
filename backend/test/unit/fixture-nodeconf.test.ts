/* The `nodeconf` fixture: the real NodeConf EU 2026 programme (SPEC §2).
 *
 * "Fill the fixture from the actual published programme. Do not approximate it
 * from memory - the value is in it being real."
 *
 * So what is worth asserting is not the data itself - that is a transcription,
 * and test/fixtures/nodeconf/README.md records what is verbatim and what is
 * derived - but that the MODEL can carry a real programme unchanged. Every
 * shape the fixture exercises is one the spec asked for.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const AgendaSrv = require('../../dist/srv/agenda/agenda-srv.js')

const NCEU = JSON.parse(Fs.readFileSync(
  Path.join(process.cwd(), 'test/fixtures/nodeconf/nodeconf.json'), 'utf8'))

const TOP = 'nceu2026'

async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 9999, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'
  seneca.context.srvname = 'all'
  seneca.test()
  basic(seneca)
  seneca.use(CagSrv)
  seneca.use(AgendaSrv)
  await seneca.ready()
  for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
    for (const row of NCEU[canon] || []) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  return seneca
}

const fixtures = () => NCEU['cag/fixture'] as any[]


describe('fixture: nodeconf (the real programme)', () => {
  test('it loads, and it is the published shape', () => {
    const top = fixtures().find((f) => TOP === f.id)
    assert.equal(top.title, 'NodeConf EU 2026')
    assert.equal(top.t_tzn, 'Europe/Rome')
    assert.match(top.p_name, /Bologna/)

    const days = fixtures().filter((f) => 'day' === f.kind)
    assert.equal(days.length, 2, 'the published programme is two days')

    // Single track, one room. That is what the 2026 edition IS - see the
    // README for why that diverges from SPEC 2's description.
    assert.equal((NCEU['cag/room'] as any[]).length, 1)
    assert.equal((NCEU['cag/track'] as any[]).length, 0)
  })

  test('segments hang at BOTH depths (SPEC 19.1)', () => {
    // "at least one explicit day fixture, and segments hanging at both
    // depths". The two evening socials hang off the conference because they
    // are conference-wide rather than part of a day's programme.
    const underTop = fixtures().filter((f) => TOP === f.parent_id && 'day' !== f.kind)
    const underDay = fixtures().filter((f) => /^nceu2026_d[12]$/.test(String(f.parent_id)))

    assert.ok(0 < underTop.length, 'nothing hangs off the conference')
    assert.ok(0 < underDay.length, 'nothing hangs off a day')
    assert.deepEqual(underTop.map((f) => f.kind), ['soc', 'soc'])
  })

  test('the mixed session kinds a talks-only model could not carry', () => {
    // SPEC 2: breaks, meals and social sessions matter as much as the talks.
    const kinds = new Set(fixtures().map((f) => f.kind))
    for (const k of ['con', 'day', 'tak', 'key', 'brk', 'mea', 'soc', 'reg']) {
      assert.ok(kinds.has(k), 'no ' + k + ' in the real programme fixture')
    }
  })

  test('every session is inside its day, and every day inside the conference', async () => {
    // The transcription's own arithmetic: times were converted from the
    // published local clock to epoch ms, and a timezone slip would show up
    // here as outside-parent-fixture rather than as a silently wrong grid.
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: TOP })

    const outside = out.diagnostics.filter((d: any) => 'outside-parent-fixture' === d.rule)
    assert.deepEqual(outside, [], JSON.stringify(outside.map((d: any) => d.message)))

    await seneca.close()
  })

  test('it validates with NO errors, and every warning is true', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: TOP })

    assert.equal(out.valid, true,
      'the real programme does not validate: ' +
      JSON.stringify(out.diagnostics.filter((d: any) => 'error' === d.severity)
        .map((d: any) => d.rule + ': ' + d.message)))

    // The warnings that remain are all the same fact stated four ways: the
    // published programme carries no abstracts, bios, photos or emails, and
    // the fixture does not invent any for real named people.
    const byRule = new Set(out.diagnostics.map((d: any) => d.rule))
    assert.deepEqual([...byRule].sort(),
      ['missing-abstract', 'missing-bio', 'missing-photo', 'speaker-no-email'])

    await seneca.close()
  })

  test('no speaker carries a fabricated email, bio or photo', async () => {
    // These are real, named people. Inventing contact details for them in a
    // committed file is not a thing to do for a test fixture - and the
    // absence is exactly what speaker-no-email exists to report.
    for (const sp of NCEU['cag/speaker'] as any[]) {
      assert.equal(sp.email, '', sp.name + ' has an invented email')
      assert.equal(sp.bio, undefined, sp.name + ' has an invented bio')
      assert.equal(sp.photo, undefined, sp.name + ' has an invented photo')
    }
  })

  test('it publishes, and the public snapshot carries no speaker email field', async () => {
    const seneca = await makeSeneca()
    const pub = await seneca.post('aim:cag,publish:fixture', { fixture_id: TOP })
    assert.equal(pub.ok, true, pub.why)

    const agenda = await seneca.post('aim:agenda,get:agenda',
      { org_id: 'org_nearform', slug: 'nodeconf-eu-2026' })
    assert.equal(agenda.ok, true, agenda.why)
    assert.ok(!JSON.stringify(agenda).includes('"email"'), 'an email reached the public path')

    await seneca.close()
  })
})
