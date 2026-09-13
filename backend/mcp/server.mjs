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

await server.connect(new StdioServerTransport())
