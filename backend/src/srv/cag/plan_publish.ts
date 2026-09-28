//// aim:cag,plan:publish - what publishing would change, and whether it can.
////
//// READ-ONLY, and modelled on plan:sync for the same reason: a confirmation
//// that states what it is about to do has to be able to compute that without
//// doing it. SPEC 13.1 asks `P` to confirm "and state what changed since the
//// last publish", which is a list, not the count load:tree already returns.
////
//// NAMED `plan:`, NOT `get:`. The SPA's transparent cache classifies any
//// aim:web message carrying a get/list/load key as a cacheable read and
//// invalidates only on a client write - see web_watch_run.ts for the bug that
//// taught us. This one changes whenever anything in the tree does.
////
//// IT BUILDS THE SNAPSHOT PUBLISHING WOULD WRITE and diffs it against the
//// stored one. Every question about what is publishable - drafts, private
//// ancestors, which rooms are in use - is buildAgenda's to answer, and asking
//// it rather than restating its rules is what stops the two drifting.

const { buildAgenda } = require('../../lib/agenda')
const { publishDiff } = require('../../lib/publish_diff')

module.exports = function make_plan_publish() {
  return async function plan_publish(this: any, msg: any) {
    const seneca = this

    const tree = await seneca.post('concern:fixture,resolve:tree', {
      fixture_id: msg.fixture_id,
    })
    if (!tree.ok) return { ok: false, why: tree.why }

    const top = tree.nodes.find((n: any) => n.id === msg.fixture_id)
    if (null == top) return { ok: false, why: 'not-found' }
    const segments = tree.nodes.filter((n: any) => n.id !== msg.fixture_id)

    // The same two refusals publish:fixture makes, reported here so the screen
    // can explain itself rather than the button failing when pressed.
    if (null == top.slug || '' === top.slug) {
      return { ok: false, why: 'no-slug' }
    }
    if (true === top.effective_private || 'draft' === top.effective_status) {
      return { ok: false, why: 'not-publishable' }
    }

    const plain = (list: any[]) => list.map((r: any) => r.data$(false))
    const q = { org_id: top.org_id }

    const next = buildAgenda({
      top,
      segments,
      rooms: plain(await seneca.entity('cag/room').list$(q)),
      tracks: plain(await seneca.entity('cag/track').list$(q)),
      speakers: plain(await seneca.entity('cag/speaker').list$(q)),
      appearances: plain(await seneca.entity('cag/appearance').list$(q)),
    })

    const snap = await seneca.entity('cag/snapshot').load$(top.org_id + ':' + top.slug)
    const published_at = snap ? (snap.published_at as number) : null

    let prev: any = null
    if (snap) {
      // A snapshot that cannot be parsed is treated as no snapshot: every
      // session reads as `added`, which overstates the change and understates
      // nothing. The alternative is reporting "no changes" over a corrupt row.
      try { prev = JSON.parse(String(snap.agenda_json)) } catch (e) { prev = null }
    }

    // THE GATE, from the one place that owns it. SPEC 16 makes errors a hard
    // block on publish, and publish:fixture already refuses with
    // `validation-failed` - so the screen asks the same question rather than
    // counting diagnostics itself.
    const check = await seneca.post('aim:cag,validate:fixture', { fixture_id: msg.fixture_id })

    return {
      ok: true,
      fixture_id: msg.fixture_id,
      title: String(top.title || top.id),
      published_at,
      changes: publishDiff(prev, next, top.t_tzn),
      session_count: (next as any).sessions.length,
      valid: true === check.valid,
      error_count: check.error_count || 0,
    }
  }
}
