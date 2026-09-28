#!/usr/bin/env node
/* conf-agenda MCP server. PLATFORM 4 lists MCP as one of the six surfaces;
 * SPEC 19.3 asks for `conf_agenda_agenda` at Stage 1.
 *
 * READ-ONLY, and that is a safety position rather than a scope decision
 * (SPEC 14): "an agent that can move sessions can email speakers." Write tools
 * exist only behind an explicit per-org opt-in, and `apply:sync` is excluded
 * even then - sending to real speakers is a human confirmation (C4).
 *
 * It reads the PUBLISHED SNAPSHOT through aim:agenda,get:agenda - the same
 * anonymous message the embed uses - so an agent sees exactly what the public
 * sees: no drafts, no private sessions, no speaker emails. That is enforced
 * structurally upstream in buildAgenda, not by filtering here.
 *
 *   node mcp/server.mjs            # stdio
 */
import Path from 'node:path'
import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const require = createRequire(import.meta.url)
const HERE = Path.dirname(new URL(import.meta.url).pathname)

const Seneca = require('seneca')
const Model = require(Path.join(HERE, '../model/model.json'))
const { basic } = require(Path.join(HERE, '../dist/env/shared/basic.js'))
const AgendaSrv = require(Path.join(HERE, '../dist/srv/agenda/agenda-srv.js'))
const CagSrv = require(Path.join(HERE, '../dist/srv/cag/cag-srv.js'))

const seneca = Seneca({ legacy: false, timeout: 22222 })
seneca.context.model = Model
seneca.context.env = 'mcp'
seneca.context.srvname = 'all'
seneca.test()
basic(seneca)
seneca.use(AgendaSrv)
seneca.use(CagSrv)
await seneca.ready()

// Stage 1 runs on the local monolith (SPEC 19.3), so the server carries its
// own data: point CONF_AGENDA_FIXTURE at a fixture bundle and it is loaded and
// published at boot. At Stage 4 this is replaced by a client to the deployed
// service; the tool body does not change, because it posts the same message
// either way.
const fixtureFile = process.env.CONF_AGENDA_FIXTURE
if (fixtureFile) {
  const Fs = require('node:fs')
  const bundle = JSON.parse(Fs.readFileSync(fixtureFile, 'utf8'))
  for (const canon of Object.keys(bundle)) {
    if (canon.startsWith('_') || !Array.isArray(bundle[canon])) continue
    for (const row of bundle[canon]) {
      await seneca.entity(canon).data$({ ...row, id$: row.id }).save$()
    }
  }
  const tops = (await seneca.entity('cag/fixture').list$({}))
    .map((r) => r.data$(false))
    .filter((f) => null == f.parent_id || '' === f.parent_id)
  for (const top of tops) {
    // Publication is gated on validation, so a fixture with errors serves
    // nothing - which is correct: an agent must not read an unpublishable
    // programme as though it were live.
    await seneca.post('aim:cag,publish:fixture', { fixture_id: top.id })
  }
}

const server = new McpServer({ name: 'conf-agenda', version: '0.0.1' })

server.registerTool(
  'conf_agenda_agenda',
  {
    title: 'Get a published conference agenda',
    description:
      'Return the published agenda for one conference: its sessions, rooms, tracks and ' +
      'speakers. Reads the published snapshot only - unpublished, draft and private ' +
      'sessions are never included, and speaker contact details are never present. ' +
      'Cancelled sessions ARE included, marked with status "cancelled".',
    inputSchema: {
      org: z.string().describe('Organisation id, e.g. "org_tiny"'),
      conference: z.string().describe('Conference slug, e.g. "tiny-conf-2027"'),
    },
  },
  async ({ org, conference }) => {
    const out = await seneca.post('aim:agenda,get:agenda', { org_id: org, slug: conference })

    if (!out.ok) {
      // An agent needs to tell "no such conference" from "a conference with no
      // sessions" - the same honesty the embed owes a visitor (SPEC 11.2).
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'not-published: no published agenda for ' + org + '/' + conference,
        }],
      }
    }

    // The frozen bytes, verbatim. Re-serialising here would break the
    // byte-identical guarantee the snapshot exists to provide (SPEC 17).
    return { content: [{ type: 'text', text: out.agenda_json }] }
  },
)

server.registerTool(
  'conf_agenda_session_find',
  {
    title: 'Find sessions in a published conference',
    description:
      'Search the published sessions of one conference by free text, speaker, track, room ' +
      'or kind, and return the matches with their times, room, track and speakers. ' +
      'Reads the same published snapshot as conf_agenda_agenda - unpublished, draft and ' +
      'private sessions are never included, and speaker contact details are never present. ' +
      'Cancelled sessions ARE included, marked with status "cancelled", because an attendee ' +
      'holding a printed programme needs to see that a talk is off. ' +
      'Use this rather than conf_agenda_agenda when looking for particular sessions: the ' +
      'full agenda of a large conference is a lot of text to read to answer one question.',
    inputSchema: {
      org: z.string().describe('Organisation id, e.g. "org_tiny"'),
      conference: z.string().describe('Conference slug, e.g. "tiny-conf-2027"'),
      query: z.string().optional()
        .describe('Free text, matched against session title and abstract, case-insensitively'),
      speaker: z.string().optional()
        .describe('Speaker name, or part of one'),
      track: z.string().optional()
        .describe('Track name or id'),
      room: z.string().optional()
        .describe('Room name or id'),
      kind: z.string().optional()
        .describe('Session kind code: key, tak, lgt, wrk, pan, brk, mea, soc, reg'),
      limit: z.number().int().positive().max(200).optional()
        .describe('Maximum matches to return. Default 50.'),
    },
  },
  async ({ org, conference, query, speaker, track, room, kind, limit }) => {
    const out = await seneca.post('aim:agenda,get:agenda', { org_id: org, slug: conference })

    if (!out.ok) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'not-published: no published agenda for ' + org + '/' + conference,
        }],
      }
    }

    const agenda = JSON.parse(out.agenda_json)
    const has = (v, needle) =>
      null != v && String(v).toLowerCase().includes(String(needle).toLowerCase())

    // Resolve room and track by NAME as well as id: an agent asking about
    // "Liffey B" should not have to know it is room_b.
    const byName = (list, needle) => (list || [])
      .filter((x) => x.id === needle || has(x.name, needle))
      .map((x) => x.id)

    const speakerName = new Map((agenda.speakers || []).map((s) => [s.id, s.name]))
    const roomName = new Map((agenda.rooms || []).map((r) => [r.id, r.name]))
    const trackName = new Map((agenda.tracks || []).map((t) => [t.id, t.name]))

    const wantRooms = null == room ? null : byName(agenda.rooms, room)
    const wantTracks = null == track ? null : byName(agenda.tracks, track)

    const matches = (agenda.sessions || []).filter((s) => {
      if (null != query && !(has(s.title, query) || has(s.desc, query))) return false
      if (null != kind && s.kind !== kind) return false
      if (null != wantRooms && !wantRooms.includes(s.room)) return false
      if (null != wantTracks && !wantTracks.includes(s.track)) return false
      if (null != speaker) {
        const names = (s.speakers || []).map((id) => speakerName.get(id) || id)
        if (!names.some((n) => has(n, speaker))) return false
      }
      return true
    })

    if (0 === matches.length) {
      // "No matches" and "no such conference" are different answers, and an
      // agent that cannot tell them apart will report the wrong one.
      return {
        content: [{
          type: 'text',
          text: 'no matching sessions in ' + org + '/' + conference +
            ' (the conference is published and has ' +
            (agenda.sessions || []).length + ' sessions)',
        }],
      }
    }

    // NAMES, not ids. A result listing `room_b` and `spk_ada` is a database
    // row; one listing "Liffey B" and "Ada Byrne" is an answer. The ids stay
    // too, so a follow-up call has something exact to use.
    const shaped = matches.slice(0, limit || 50).map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      status: s.status,
      t_start: s.t_start,
      t_end: s.t_end,
      room: null == s.room ? undefined : { id: s.room, name: roomName.get(s.room) },
      track: null == s.track ? undefined : { id: s.track, name: trackName.get(s.track) },
      speakers: (s.speakers || []).map((id) => ({ id, name: speakerName.get(id) || id })),
      desc: s.desc,
    }))

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          conference: agenda.conference,
          // Say when the answer is cut short, rather than letting an agent
          // conclude there were only `limit` matches.
          matched: matches.length,
          returned: shaped.length,
          truncated: shaped.length < matches.length,
          sessions: shaped,
        }, null, 2),
      }],
    }
  },
)

server.registerTool(
  'conf_agenda_speaker_find',
  {
    title: 'Find speakers in a published conference',
    description:
      'Search the published speakers of one conference by name, bio or organisation, and ' +
      'return each with the sessions they appear on. Reads the published snapshot, so ' +
      'contact details are never present: the snapshot does not carry them. ' +
      'Use this to answer "who is speaking about X" or "what is this person talking about".',
    inputSchema: {
      org: z.string().describe('Organisation id, e.g. "org_demo"'),
      conference: z.string().describe('Conference slug, e.g. "demo-conf-2027"'),
      query: z.string().optional()
        .describe('Free text, matched against name, bio and organisation, case-insensitively'),
      limit: z.number().int().positive().max(200).optional()
        .describe('Maximum matches to return. Default 50.'),
    },
  },
  async ({ org, conference, query, limit }) => {
    const out = await seneca.post('aim:agenda,get:agenda', { org_id: org, slug: conference })
    if (!out.ok) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'not-published: no published agenda for ' + org + '/' + conference,
        }],
      }
    }

    const agenda = JSON.parse(out.agenda_json)
    const has = (v, needle) =>
      null != v && String(v).toLowerCase().includes(String(needle).toLowerCase())

    const roomName = new Map((agenda.rooms || []).map((r) => [r.id, r.name]))

    // Which sessions each speaker is on. An agent asking about a person wants
    // the talks, not a row from a join table.
    const bySpeaker = new Map()
    for (const sess of agenda.sessions || []) {
      for (const sid of sess.speakers || []) {
        const list = bySpeaker.get(sid) || []
        list.push({
          id: sess.id,
          title: sess.title,
          status: sess.status,
          t_start: sess.t_start,
          t_end: sess.t_end,
          room: null == sess.room ? undefined : { id: sess.room, name: roomName.get(sess.room) },
        })
        bySpeaker.set(sid, list)
      }
    }

    const matches = (agenda.speakers || []).filter((sp) =>
      null == query || has(sp.name, query) || has(sp.bio, query) || has(sp.org_name, query))

    if (0 === matches.length) {
      return {
        content: [{
          type: 'text',
          text: 'no matching speakers in ' + org + '/' + conference +
            ' (the conference is published and lists ' +
            (agenda.speakers || []).length + ' speakers)',
        }],
      }
    }

    const shaped = matches.slice(0, limit || 50).map((sp) => ({
      id: sp.id,
      name: sp.name,
      org_name: sp.org_name,
      bio: sp.bio,
      // A speaker listed in the snapshot but on no session cannot happen
      // (buildAgenda only includes speakers with appearances), so an empty
      // array here would be a bug rather than a fact. Reported as-is.
      sessions: bySpeaker.get(sp.id) || [],
    }))

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          conference: agenda.conference,
          matched: matches.length,
          returned: shaped.length,
          truncated: shaped.length < matches.length,
          speakers: shaped,
        }, null, 2),
      }],
    }
  },
)


server.registerTool(
  'conf_agenda_validate',
  {
    title: 'Validate a conference before publishing',
    description:
      'Run the validation rules over a conference and return the diagnostics: errors that ' +
      'block publication and warnings that do not. Each diagnostic carries a stable rule id, ' +
      'a one-line message naming both sides of any clash, and a suggested fix. ' +
      'Unlike the other tools this reads the LIVE programme rather than the published ' +
      'snapshot, because validation exists to catch problems BEFORE publishing: it therefore ' +
      'names draft and unpublished sessions. It still never returns contact details.',
    inputSchema: {
      org: z.string().describe('Organisation id, e.g. "org_tiny"'),
      conference: z.string().describe('Conference slug, e.g. "tiny-conf-2027"'),
      severity: z.enum(['all', 'error', 'warn']).optional()
        .describe('Filter the diagnostics. Default "all".'),
    },
  },
  async ({ org, conference, severity }) => {
    // The other tools take org + slug, so this one does too, and resolves the
    // fixture id itself. An agent should not have to know an internal id to
    // ask about a conference it found by slug.
    const tops = (await seneca.entity('cag/fixture').list$({ org_id: org, slug: conference }))
      .map((r) => r.data$(false))
      .filter((f) => null == f.parent_id || '' === f.parent_id)

    if (0 === tops.length) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'not-found: no conference ' + org + '/' + conference,
        }],
      }
    }

    const out = await seneca.post('aim:cag,validate:fixture', { fixture_id: tops[0].id })
    if (!out.ok) {
      return { isError: true, content: [{ type: 'text', text: String(out.why || 'validate-failed') }] }
    }

    const want = severity || 'all'
    const diagnostics = (out.diagnostics || [])
      .filter((d) => 'all' === want || d.severity === want)
      .map((d) => ({
        rule: d.rule,
        severity: d.severity,
        message: d.message,
        fix: d.fix,
        // Ids AND labels, the same reasoning as the other tools: an agent
        // needs something exact for a follow-up call and something readable
        // for its answer.
        entity: d.entity,
        related: d.related,
      }))

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          conference: { id: tops[0].id, slug: conference, title: tops[0].title },
          // `valid` is the gate publish and apply:sync read. Stated plainly,
          // because "no errors returned" and "passes" must not be inferred
          // from an empty list that was filtered by `severity`.
          valid: true === out.valid,
          error_count: out.error_count || 0,
          warn_count: out.warn_count || 0,
          severity: want,
          diagnostics,
        }, null, 2),
      }],
    }
  },
)


await server.connect(new StdioServerTransport())
