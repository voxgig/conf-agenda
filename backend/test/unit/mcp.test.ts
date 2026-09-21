/* The MCP surface. SPEC §14, PLATFORM §4.
 *
 * It had NO tests. `conf_agenda_agenda` shipped at Stage 1 and nothing
 * exercised it - which matters more here than for most surfaces, because the
 * whole safety position is a claim about what an agent CANNOT see:
 *
 *   "Read-only by default - an agent that can move sessions can email
 *    speakers."
 *
 * So the assertions that earn their place are the absences: no draft, no
 * private session, no speaker email, and no write tool registered at all.
 *
 * This drives the real server over real stdio rather than calling a handler
 * directly. The transport is where a tool registration goes wrong, and a test
 * that imports the module would not notice.
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert'
import Path from 'node:path'

let client: any
let transport: any

before(async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } =
    await import('@modelcontextprotocol/sdk/client/stdio.js')

  transport = new StdioClientTransport({
    command: process.execPath,
    args: [Path.join(process.cwd(), 'mcp', 'server.mjs')],
    // The server carries its own data at Stage 1 (see its header). `tiny` is
    // the fixture with the deliberate room clash, which makes the
    // publication gate observable rather than theoretical.
    env: {
      ...process.env,
      CONF_AGENDA_FIXTURE: Path.join(process.cwd(), 'test/fixtures/demo/demo.json'),
    },
  })

  client = new Client({ name: 'conf-agenda-test', version: '0.0.0' })
  await client.connect(transport)
})

after(async () => {
  if (client) await client.close()
})

const text = (res: any) => String(res.content[0].text)
const json = (res: any) => JSON.parse(text(res))


describe('the MCP surface', () => {
  test('both tools are registered, and NOTHING that writes is', async () => {
    // SPEC §14: write tools exist only behind an explicit per-org opt-in, and
    // apply:sync is excluded even then. None of that opt-in machinery exists
    // yet, so the correct number of write tools is zero - and this is the
    // assertion that notices if one is ever added by accident.
    const { tools } = await client.listTools()
    const names = tools.map((t: any) => t.name).sort()

    assert.deepEqual(names, ['conf_agenda_agenda', 'conf_agenda_session_find'])

    for (const t of tools) {
      assert.ok(!/(move|set|make|remove|add|update|duplicate|publish|apply|sync)_/.test(t.name),
        'a write tool is registered: ' + t.name)
    }
  })

  test('conf_agenda_agenda returns the published snapshot, byte for byte', async () => {
    const res = await client.callTool({
      name: 'conf_agenda_agenda',
      arguments: { org: 'org_demo', conference: 'demo-conf-2027' },
    })
    const agenda = json(res)
    assert.equal(agenda.schemaVersion, 1)
    assert.ok(0 < agenda.sessions.length)
  })

  test('known-ABSENT: no speaker email, no draft, no private session', async () => {
    // C6 is enforced structurally in buildAgenda - never picked up rather
    // than filtered out - so this is checking that the MCP tool reads the
    // snapshot rather than the live rows.
    const res = await client.callTool({
      name: 'conf_agenda_agenda',
      arguments: { org: 'org_demo', conference: 'demo-conf-2027' },
    })
    const raw = text(res)
    assert.ok(!raw.includes('"email"'), 'a speaker email reached an agent')

    const agenda = JSON.parse(raw)
    for (const s of agenda.sessions) {
      assert.notEqual(s.status, 'draft', 'a draft session reached an agent: ' + s.id)
      assert.notEqual(s.private, true)
    }
  })

  test('a cancelled session IS included, marked cancelled', async () => {
    // SPEC §9.1: an attendee holding a printed programme needs to see that a
    // talk is off, and a silently vanished session looks like a bug.
    const res = await client.callTool({
      name: 'conf_agenda_agenda',
      arguments: { org: 'org_demo', conference: 'demo-conf-2027' },
    })
    const agenda = json(res)
    assert.ok(agenda.sessions.some((s: any) => 'cancelled' === s.status),
      'the demo fixture has a cancelled session and the agent cannot see it')
  })

  test('an unpublished conference is an ERROR, not an empty agenda', async () => {
    // An agent needs to tell "no such conference" from "a conference with no
    // sessions" - the same honesty the embed owes a visitor.
    const res = await client.callTool({
      name: 'conf_agenda_agenda',
      arguments: { org: 'org_demo', conference: 'no-such-conference' },
    })
    assert.equal(res.isError, true)
    assert.match(text(res), /not-published/)
  })
})


describe('conf_agenda_session_find', () => {
  const find = (args: any) =>
    client.callTool({ name: 'conf_agenda_session_find', arguments: args })

  const base = { org: 'org_demo', conference: 'demo-conf-2027' }

  test('free text matches title and abstract', async () => {
    const all = json(await find(base))
    assert.ok(1 < all.matched, 'nothing to narrow')

    const one = json(await find({ ...base, query: all.sessions[0].title.split(' ')[0] }))
    assert.ok(0 < one.matched)
    assert.ok(one.matched <= all.matched, 'a query widened the result')
  })

  test('it answers in NAMES, and keeps the ids', async () => {
    // A result listing `room_b` and `spk_ada` is a database row; one listing
    // "Liffey B" and "Ada Byrne" is an answer. Both, so a follow-up call has
    // something exact to use.
    const out = json(await find(base))
    const withRoom = out.sessions.find((s: any) => null != s.room)
    assert.ok(withRoom, 'no session has a room')
    assert.ok(withRoom.room.id)
    assert.ok(withRoom.room.name)
    assert.notEqual(withRoom.room.id, withRoom.room.name)

    const withSpeaker = out.sessions.find((s: any) => 0 < (s.speakers || []).length)
    assert.ok(withSpeaker.speakers[0].name)
  })

  test('a room can be named rather than identified', async () => {
    // An agent asking about "Liffey B" should not have to know it is room_b.
    const all = json(await find(base))
    const withRoom = all.sessions.find((s: any) => null != s.room)

    const byId = json(await find({ ...base, room: withRoom.room.id }))
    const byName = json(await find({ ...base, room: withRoom.room.name }))
    assert.equal(byName.matched, byId.matched)
    assert.ok(0 < byName.matched)
  })

  test('kind narrows to one sort of session', async () => {
    const talks = json(await find({ ...base, kind: 'tak' }))
    for (const s of talks.sessions) assert.equal(s.kind, 'tak')
  })

  test('no matches says so, and says the conference IS published', async () => {
    const out = text(await find({ ...base, query: 'zzzz-no-such-session-zzzz' }))
    assert.match(out, /no matching sessions/)
    assert.match(out, /is published/)
  })

  test('truncation is announced rather than silent', async () => {
    // An agent given `limit` results and no flag concludes there were only
    // `limit` matches, and reports that as fact.
    const out = json(await find({ ...base, limit: 1 }))
    assert.equal(out.returned, 1)
    assert.ok(1 < out.matched)
    assert.equal(out.truncated, true)
  })

  test('known-ABSENT: find cannot see an email either', async () => {
    const raw = text(await find(base))
    assert.ok(!raw.includes('"email"'), 'a speaker email reached an agent through find')
  })

  test('an unpublished conference is an ERROR here too', async () => {
    const res = await find({ ...base, conference: 'no-such-conference' })
    assert.equal(res.isError, true)
    assert.match(text(res), /not-published/)
  })
})
