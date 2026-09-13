// Generate embed/test/agenda.json by running the REAL publish pipeline over
// the tiny fixture - so the embed's test page renders what the backend
// actually produces, not a hand-written approximation that can drift.
import Fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const Seneca = require('seneca')
const Model = require('../model/model.json')
const { basic } = require('../dist/env/shared/basic.js')
const CagSrv = require('../dist/srv/cag/cag-srv.js')
const AgendaSrv = require('../dist/srv/agenda/agenda-srv.js')

const TINY = JSON.parse(Fs.readFileSync('test/fixtures/tiny/tiny.json', 'utf8'))

const s = Seneca({ legacy: false, timeout: 9999 })
s.context.model = Model
s.context.env = 'test'
s.context.srvname = 'all'
s.test()
basic(s)
s.use(CagSrv)
s.use(AgendaSrv)
await s.ready()

for (const canon of ['cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance']) {
  for (const row of TINY[canon]) {
    await s.entity(canon).data$({ ...row, id$: row.id }).save$()
  }
}

// Resolve the fixture's deliberate clash so the programme can publish.
const seg = await s.entity('cag/fixture').load$('seg_d1edge')
seg.t_start = 1825239600000
seg.t_end = 1825243200000
await seg.save$()

const pub = await s.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
if (!pub.ok) {
  console.error('publish failed:', pub)
  process.exit(1)
}

const got = await s.post('aim:agenda,get:agenda', { org_id: 'org_tiny', slug: 'tiny-conf-2027' })
Fs.writeFileSync('../embed/test/agenda.json', JSON.stringify(got.agenda, null, 2) + '\n')

console.log('wrote embed/test/agenda.json')
console.log('  sessions:', got.agenda.sessions.length,
            'speakers:', got.agenda.speakers.length,
            'rooms:', got.agenda.rooms.length)
console.log('  contains "@" (any email):', JSON.stringify(got.agenda).includes('@'))
await s.close()

// @seneca/reload defaults to active:true and runs a chokidar FSWatcher that
// keeps the event loop alive after close - the same footgun recorded in the
// Cloudflare spike findings. A one-shot script must exit explicitly.
process.exit(0)
