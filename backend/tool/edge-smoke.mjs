// Smoke-check a deployed public agenda Worker over the real network.
//
//   node tool/edge-smoke.mjs <base-url> [--expect <snapshot.json>] [--key <org>/<slug>]
//
// Always: an unpublished slug answers 404 not-published, an off-route path
// answers 404, and no response is a redirect (an Access login in front of
// /agenda/* breaks SPEC 9.1 and 11.2). With --expect, the seeded agenda too:
// json byte for byte against the file, ics and csv served inline, and the
// TTFB median against SPEC 17's 200ms. --key defaults to the nodeconf
// fixture's org_id:slug. Exits 1 if any check fails.

import Fs from 'node:fs'

const BUDGET_MS = 200
const RUNS = 20

const args = process.argv.slice(2)
const base = args.find((a) => !a.startsWith('--') && !isFlagValue(a))
const expectFile = flag('--expect')
const key = flag('--key') || 'org_nearform/nodeconf-eu-2026'

function flag(name) {
  const i = args.indexOf(name)
  return -1 === i ? null : args[i + 1]
}

function isFlagValue(a) {
  const i = args.indexOf(a)
  return 0 < i && args[i - 1].startsWith('--')
}

if (null == base) {
  console.error('usage: node tool/edge-smoke.mjs <base-url> [--expect <snapshot.json>] [--key <org>/<slug>]')
  process.exit(2)
}

const origin = base.replace(/\/+$/, '')
let failed = 0

function check(ok, what, detail = '') {
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (detail ? '  (' + detail + ')' : ''))
  if (!ok) failed++
}

// No cookies, and redirects seen rather than followed, so a login redirect
// fails the check instead of quietly landing on the login page.
async function get(path) {
  const t0 = performance.now()
  const res = await fetch(origin + path, { redirect: 'manual' })
  const ttfb = performance.now() - t0
  const body = Buffer.from(await res.arrayBuffer())
  const loc = res.headers.get('location') || ''
  check(
    !(300 <= res.status && res.status < 400),
    'no redirect on ' + path,
    loc ? res.status + ' to ' + new URL(loc, origin).host : '',
  )
  return { res, body, ttfb }
}

const missing = await get('/agenda/org_smoke/no-such-conference.json')
check(404 === missing.res.status, 'unpublished slug is 404', String(missing.res.status))
check(
  missing.body.toString('utf8').includes('not-published'),
  'unpublished slug says not-published',
  missing.body.toString('utf8').slice(0, 60),
)

const off = await get('/not-an-agenda')
check(404 === off.res.status, 'off-route path is 404', String(off.res.status))

if (null != expectFile) {
  const want = Fs.readFileSync(expectFile)
  const path = '/agenda/' + key

  const json = await get(path + '.json')
  check(200 === json.res.status, 'agenda json is 200', String(json.res.status))
  check(want.equals(json.body), 'agenda json equals ' + expectFile + ' byte for byte',
    json.body.length + ' vs ' + want.length + ' bytes')
  check('*' === json.res.headers.get('access-control-allow-origin'), 'agenda json allows any origin')

  for (const [ext, type] of [['ics', 'text/calendar'], ['csv', 'text/csv']]) {
    const feed = await get(path + '.' + ext)
    check(200 === feed.res.status, ext + ' feed is 200', String(feed.res.status))
    check((feed.res.headers.get('content-type') || '').startsWith(type), ext + ' feed is ' + type)
    check((feed.res.headers.get('content-disposition') || '').startsWith('inline'), ext + ' feed is inline')
  }

  // TTFB: until the response headers arrive. The first request also pays
  // for DNS and TLS, so it is reported apart and kept out of the median.
  const times = []
  for (let i = 0; i < RUNS; i++) times.push((await get(path + '.json')).ttfb)
  times.sort((a, b) => a - b)
  const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2
  console.log(
    `ttfb ${origin}${path}.json: first ${json.ttfb.toFixed(1)}ms, then median ` +
    `${median.toFixed(1)}ms, max ${times[RUNS - 1].toFixed(1)}ms over ${RUNS}`,
  )
  check(median < BUDGET_MS, 'ttfb median under ' + BUDGET_MS + 'ms (SPEC 17)', median.toFixed(1) + 'ms')
}

console.log(failed ? failed + ' check(s) failed' : 'all checks passed')
process.exit(failed ? 1 : 0)
