// Drive the MCP server over stdio and check the one Stage 1 tool.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'check', version: '0.0.1' })
await client.connect(new StdioClientTransport({
  command: 'node',
  args: ['mcp/server.mjs'],
  env: { ...process.env, CONF_AGENDA_FIXTURE: process.argv[2] },
}))

const tools = await client.listTools()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))

const ok = await client.callTool({
  name: 'conf_agenda_agenda',
  arguments: { org: 'org_tiny', conference: 'tiny-conf-2027' },
})
const body = ok.content[0].text
const agenda = JSON.parse(body)
console.log('sessions:', agenda.sessions.length, '| speakers:', agenda.speakers.length)
console.log('contains an email:', body.includes('@'))
console.log('schemaVersion:', agenda.schemaVersion)

const miss = await client.callTool({
  name: 'conf_agenda_agenda',
  arguments: { org: 'org_tiny', conference: 'no-such-conf' },
})
console.log('unknown conference isError:', true === miss.isError, '|', miss.content[0].text.slice(0, 40))

await client.close()
process.exit(0)
