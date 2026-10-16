// ConfAgenda public agenda - Cloudflare Worker entry (generated once; edited).
//
// THE PUBLIC READ PATH AT THE EDGE. Serves /agenda/<org>/<slug>.{json,ics,csv}
// from a KV namespace holding the exact agenda_json string publish:fixture
// froze, under the same org_id:slug key cag/snapshot uses. It is the same URL
// shape the Express runner serves (src/env/web/web.ts) and the embed defaults
// to (SPEC 11.2), so moving a conference here is a host swap.
//
// NO SENECA, ON PURPOSE. Nothing on this path is composed per request: json
// is a key lookup served verbatim, and the feeds are a pure function of it.
// A Seneca instance cannot be built at Worker module scope or reused across
// requests, so it would be built per request, and the Cloudflare spike
// measured that at 135 to 155ms (docs/decisions/cloudflare-spike.md). Against
// SPEC 17's 200ms TTFB budget that is most of it, spent on nothing. The only
// project module imported is the pure feed builder, and
// test/unit/worker-agenda.test.ts holds the module graph to that.
//
// The headers are copied from web.ts, not chosen afresh, so caches and
// third-party pages treat both surfaces the same.

import { buildIcs, buildCsv } from '../../lib/ics'

// The subset of the Workers KV binding this file uses.
export type AgendaKV = {
  get(key: string): Promise<string | null>
}

export type Env = {
  AGENDA: AgendaKV
}

// Same pattern as Express's '/agenda/:org/:slug.:ext'.
const ROUTE = /^\/agenda\/([^/]+)\/([^/]+?)\.([^/.]+)$/

// Same values as get_feed.ts's TYPE.
const FEED_TYPE: Record<string, string> = {
  ics: 'text/calendar; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export default {
  async fetch(request: Request, env: Env, _ctx?: unknown): Promise<Response> {
    const url = new URL(request.url)
    const m = ROUTE.exec(url.pathname)

    // Off the route: refused before any KV read.
    if (null == m || 'GET' !== request.method && 'HEAD' !== request.method) {
      return text(404, 'not found')
    }

    const org = decodeURIComponent(m[1])
    const slug = decodeURIComponent(m[2])
    const ext = m[3]

    if ('json' !== ext && null == FEED_TYPE[ext]) {
      return text(404, 'unknown format: ' + ext)
    }

    const agenda_json = await env.AGENDA.get(org + ':' + slug)

    if ('json' === ext) {
      if (null == agenda_json) {
        return new Response(JSON.stringify({ ok: false, why: 'not-published' }), {
          status: 404,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        })
      }

      // The stored bytes, verbatim. Never parse and reserialise: SPEC 17
      // requires byte-identical output and the content hash depends on it.
      return new Response(agenda_json, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          // Public, cacheable, and revalidated often enough for a day-of
          // change to land (SPEC 21 Q3: snapshot plus short-TTL revalidation).
          'cache-control': 'public, max-age=60, stale-while-revalidate=600',
          'access-control-allow-origin': '*',
        },
      })
    }

    if (null == agenda_json) {
      return text(404, 'not-published')
    }

    const agenda = JSON.parse(agenda_json)
    const body = 'ics' === ext ? buildIcs(agenda) : buildCsv(agenda)

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': FEED_TYPE[ext],
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
        'access-control-allow-origin': '*',
        // inline, not attachment: a calendar client subscribing to the URL
        // should read it, not download it.
        'content-disposition': 'inline; filename="' + slug + '.' + ext + '"',
      },
    })
  },
}
