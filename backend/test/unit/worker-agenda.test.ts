import { describe, test, before, after } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Seneca from 'seneca'
import Model from '../../model/model.json'

const { basic } = require('../../dist/env/shared/basic.js')
const CagSrv = require('../../dist/srv/cag/cag-srv.js')
const AgendaSrv = require('../../dist/srv/agenda/agenda-srv.js')
const Worker = require('../../dist/env/cloudflare/worker.js').default

// The public read path at the edge (src/env/cloudflare/worker.ts), driven as
// a plain function of a Request and an env, against a Map-backed KV fake.
// The service path is the reference: the Worker must serve what
// aim:agenda,get:agenda and aim:agenda,get:feed serve, byte for byte.

const ROOT = process.cwd()
const ORG = 'org_tiny'
const SLUG = 'tiny-conf-2027'
const HOST = 'https://edge.test'

const TINY = JSON.parse(
  Fs.readFileSync(Path.join(ROOT, 'test/fixtures/tiny/tiny.json'), 'utf8'),
)

function makeKV(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  const kv = {
    reads: 0,
    async get(key: string) {
      kv.reads++
      return map.has(key) ? (map.get(key) as string) : null
    },
  }
  return kv
}

function get(kv: any, path: string, method = 'GET') {
  return Worker.fetch(new Request(HOST + path, { method }), { AGENDA: kv })
}

// The values the Express public route sets, read from its source so the two
// cannot drift apart without this file noticing. In route order: json, feed.
function webHeaders() {
  const src = Fs.readFileSync(Path.join(ROOT, 'src/env/web/web.ts'), 'utf8')
  const route = src.slice(src.indexOf("app.get('/agenda/"))
  const cache = [...route.matchAll(/\.set\('Cache-Control', '([^']+)'\)/g)].map((m) => m[1])
  const cors = [...route.matchAll(/\.set\('Access-Control-Allow-Origin', '([^']+)'\)/g)].map((m) => m[1])
  const disp = /\.set\('Content-Disposition', '([^']+)'/.exec(route)
  assert.equal(cache.length, 2, 'web.ts sets Cache-Control on json and on feeds')
  assert.equal(cors.length, 2, 'web.ts sets CORS on json and on feeds')
  assert.ok(disp, 'web.ts sets Content-Disposition on feeds')
  return { jsonCache: cache[0], feedCache: cache[1], cors, dispPrefix: disp![1] }
}

let seneca: any
let AGENDA_JSON: string

before(async () => {
  seneca = Seneca({ legacy: false, timeout: 5555, debug: { undead: true } })
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

  // Resolve the fixture's deliberate clash so the programme can publish.
  const seg = await seneca.entity('cag/fixture').load$('seg_d1edge')
  seg.t_start = 1825239600000 // 11:00
  seg.t_end = 1825243200000 // 12:00
  await seg.save$()

  const pub = await seneca.post('aim:cag,publish:fixture', { fixture_id: 'conf_tiny' })
  assert.equal(pub.ok, true)

  const got = await seneca.post('aim:agenda,get:agenda', { org_id: ORG, slug: SLUG })
  assert.equal(got.ok, true)
  AGENDA_JSON = got.agenda_json
})

after(async () => {
  await seneca.close()
})

describe('worker: the public agenda at the edge', () => {
  test('json is the stored snapshot, byte for byte', async () => {
    // Stored with a key order and whitespace a reserialise would not keep,
    // so a JSON.parse then JSON.stringify cannot pass by accident.
    const stored = '{ "zeta": 1,\n  "alpha": [ 2, 3 ] }'
    const kv = makeKV({ [ORG + ':' + SLUG]: stored })
    const res = await get(kv, '/agenda/' + ORG + '/' + SLUG + '.json')
    assert.equal(res.status, 200)
    assert.equal(await res.text(), stored)
    assert.equal(kv.reads, 1)

    // And the real published snapshot, as get:agenda hands it out.
    const real = await get(makeKV({ [ORG + ':' + SLUG]: AGENDA_JSON }),
      '/agenda/' + ORG + '/' + SLUG + '.json')
    assert.equal(await real.text(), AGENDA_JSON)
  })

  test('json carries the cache and origin headers web.ts sets', async () => {
    const want = webHeaders()
    const res = await get(makeKV({ [ORG + ':' + SLUG]: AGENDA_JSON }),
      '/agenda/' + ORG + '/' + SLUG + '.json')
    assert.match(res.headers.get('content-type') || '', /^application\/json/)
    assert.equal(res.headers.get('cache-control'), want.jsonCache)
    assert.equal(res.headers.get('access-control-allow-origin'), want.cors[0])
  })

  test('a missing key is 404 not-published, in the service path\'s word', async () => {
    const kv = makeKV()
    const res = await get(kv, '/agenda/' + ORG + '/unpublished.json')
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { ok: false, why: 'not-published' })

    const svc = await seneca.post('aim:agenda,get:agenda', { org_id: ORG, slug: 'unpublished' })
    assert.equal(svc.why, 'not-published')

    for (const ext of ['ics', 'csv']) {
      const feed = await get(kv, '/agenda/' + ORG + '/unpublished.' + ext)
      assert.equal(feed.status, 404)
      assert.equal(await feed.text(), 'not-published')
    }
  })

  test('an unknown extension is 404 and names the format', async () => {
    const kv = makeKV({ [ORG + ':' + SLUG]: AGENDA_JSON })
    const res = await get(kv, '/agenda/' + ORG + '/' + SLUG + '.xml')
    assert.equal(res.status, 404)
    assert.match(await res.text(), /xml/)
  })

  test('any other path is 404 with ZERO KV reads', async () => {
    const kv = makeKV({ [ORG + ':' + SLUG]: AGENDA_JSON })
    for (const path of [
      '/',
      '/agenda',
      '/agenda/' + ORG,
      '/agenda/' + ORG + '/' + SLUG,
      '/agenda/' + ORG + '/' + SLUG + '.json/extra',
      '/api/agenda/' + ORG + '/' + SLUG + '.json',
      '/model.json',
    ]) {
      const res = await get(kv, path)
      assert.equal(res.status, 404, path)
    }
    const post = await get(kv, '/agenda/' + ORG + '/' + SLUG + '.json', 'POST')
    assert.equal(post.status, 404, 'only GET and HEAD, as the Express route')
    assert.equal(kv.reads, 0)
  })

  for (const ext of ['ics', 'csv']) {
    test(ext + ' is byte-identical to aim:agenda,get:feed for the same snapshot', async () => {
      const svc = await seneca.post('aim:agenda,get:feed', { org_id: ORG, slug: SLUG, format: ext })
      assert.equal(svc.ok, true)

      const res = await get(makeKV({ [ORG + ':' + SLUG]: AGENDA_JSON }),
        '/agenda/' + ORG + '/' + SLUG + '.' + ext)
      assert.equal(res.status, 200)
      const body = await res.text()
      assert.ok(body.length > 0)
      assert.equal(body, svc.body)

      const want = webHeaders()
      assert.equal(res.headers.get('content-type'), svc.content_type)
      assert.equal(res.headers.get('cache-control'), want.feedCache)
      assert.equal(res.headers.get('access-control-allow-origin'), want.cors[1])
      assert.equal(res.headers.get('content-disposition'),
        want.dispPrefix + svc.filename + '"')
      assert.match(res.headers.get('content-disposition') || '', /^inline;/)
    })
  }

  test('a feed is cached for longer than the agenda, as web.ts has it', () => {
    const want = webHeaders()
    const age = (v: string) => Number(/max-age=(\d+)/.exec(v)![1])
    assert.ok(age(want.feedCache) > age(want.jsonCache))
  })
})

// The module graph of the Worker SOURCE, which is what wrangler bundles.
// Follows relative imports through src/, and collects every bare specifier.
function graph(entry: string) {
  const files = new Set<string>()
  const bare = new Set<string>()
  const SPEC = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

  const walk = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    const src = Fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1]
      if (spec.startsWith('.')) {
        const base = Path.resolve(Path.dirname(file), spec)
        const hit = [base + '.ts', base + '/index.ts', base]
          .find((p) => Fs.existsSync(p) && Fs.statSync(p).isFile())
        assert.ok(hit, 'resolves ' + spec + ' from ' + file)
        walk(hit!)
      }
      else {
        bare.add(spec)
      }
    }
  }
  walk(Path.join(ROOT, entry))
  return {
    project: [...files].map((f) => Path.relative(ROOT, f)).sort(),
    bare: [...bare].sort(),
  }
}

const RUNTIME = /seneca|gateway|store|express/i

describe('worker: no application runtime in the request path', () => {
  test('the walker sees a service runtime where one is (known-present)', () => {
    // web.ts boots Seneca behind Express. If the walker cannot see that, an
    // empty result for the Worker proves nothing.
    const web = graph('src/env/web/web.ts')
    assert.ok(web.bare.some((s) => /^seneca$/.test(s)), 'web.ts reaches seneca: ' + web.bare)
    assert.ok(web.bare.some((s) => RUNTIME.test(s) && !/^seneca$/.test(s)),
      'and a gateway or express package')
  })

  test('the Worker reaches only the pure feed builder (known-absent)', () => {
    const w = graph('src/env/cloudflare/worker.ts')
    assert.deepEqual(w.project, ['src/env/cloudflare/worker.ts', 'src/lib/ics.ts'])
    assert.deepEqual(w.bare.filter((s) => RUNTIME.test(s)), [])
    assert.deepEqual(w.bare, [], 'no packages at all: ' + w.bare)
  })
})
