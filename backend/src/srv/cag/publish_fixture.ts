//// aim:cag,publish:fixture - freeze a conference into its public snapshot.
////
//// Validation is a HARD GATE (SPEC 16): an invalid programme is never
//// published, and therefore never generates an invitation.

const { buildAgenda, SCHEMA_VERSION } = require('../../lib/agenda')

module.exports = function make_publish_fixture() {
  return async function publish_fixture(this: any, msg: any) {
    const seneca = this

    const valid = await seneca.post('aim:cag,validate:fixture', {
      fixture_id: msg.fixture_id,
    })

    if (!valid.ok) {
      return { ok: false, why: valid.why }
    }

    // The gate. Publication is blocked while errors remain - the organiser
    // fixes them first (the app shows them; SPEC 16).
    if (!valid.valid) {
      return {
        ok: false,
        why: 'validation-failed',
        error_count: valid.error_count,
        diagnostics: valid.diagnostics,
      }
    }

    const tree = await seneca.post('concern:fixture,resolve:tree', {
      fixture_id: msg.fixture_id,
    })
    if (!tree.ok) return { ok: false, why: tree.why }

    const top = tree.nodes.find((n: any) => n.id === msg.fixture_id)
    const segments = tree.nodes.filter((n: any) => n.id !== msg.fixture_id)

    if (null == top.slug || '' === top.slug) {
      return { ok: false, why: 'no-slug' }
    }

    // A conference that is itself draft or private has nothing to publish.
    // Checked on effective values, like everything else.
    if (true === top.effective_private || 'draft' === top.effective_status) {
      return { ok: false, why: 'not-publishable' }
    }

    const plain = (list: any[]) => list.map((r: any) => r.data$(false))
    const q = { org_id: top.org_id }

    const agenda = buildAgenda({
      top,
      segments,
      rooms: plain(await seneca.entity('cag/room').list$(q)),
      tracks: plain(await seneca.entity('cag/track').list$(q)),
      speakers: plain(await seneca.entity('cag/speaker').list$(q)),
      appearances: plain(await seneca.entity('cag/appearance').list$(q)),
    })

    // One row per (org, slug): republishing overwrites in place rather than
    // appending, so the public path never has two candidate snapshots.
    const id = top.org_id + ':' + top.slug

    const fields = {
      org_id: top.org_id,
      top_id: top.id,
      slug: top.slug,
      schema_version: SCHEMA_VERSION,
      published_at: seneca.context.now ? seneca.context.now() : Date.now(),
      agenda_json: JSON.stringify(agenda),
    }

    // Upsert: id$ only ever CREATES, so a republish must load and update in
    // place. Same discipline as @seneca/calendar's outbox - one row per
    // identity, updated rather than appended.
    const existing = await seneca.entity('cag/snapshot').load$(id)
    if (null != existing) {
      await existing.data$(fields).save$()
    } else {
      await seneca.entity('cag/snapshot').data$({ id$: id, ...fields }).save$()
    }

    return {
      ok: true,
      snapshot_id: id,
      slug: top.slug,
      session_count: (agenda as any).sessions.length,
    }
  }
}
