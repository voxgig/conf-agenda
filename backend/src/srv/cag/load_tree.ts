//// aim:cag,load:tree - the organiser's view of a conference.
////
//// Deliberately NOT the published snapshot: the app must show drafts, which
//// agenda.json never contains. Authenticated, unlike aim:agenda,get:agenda.
////
//// Read-only. Every mutation is a named intent message (move:segment,
//// set:status, ...) with its own closed shape - there is no generic
//// canon-plus-item save anywhere on the browser surface (SPEC 9).

module.exports = function make_load_tree() {
  return async function load_tree(this: any, msg: any) {
    const seneca = this

    // Every conference this caller can see, so the app can offer a switcher
    // without a second message. Sorted, so the default pick is stable.
    const tops = (await seneca.entity('cag/fixture').list$({}))
      .map((r: any) => r.data$(false))
      .filter((f: any) => null == f.parent_id || '' === f.parent_id)
      .map((f: any) => ({ id: f.id, title: f.title, slug: f.slug, status: f.status }))
      .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    // fixture_id is optional: with none, open the first conference. The app
    // has to render something before the organiser has chosen anything.
    const fixture_id = msg.fixture_id || (tops[0] && tops[0].id)
    if (null == fixture_id) return { ok: true, tops: [], top: null, segments: [] }

    const tree = await seneca.post('concern:fixture,resolve:tree', { fixture_id })
    if (!tree.ok) return { ok: false, why: tree.why }

    const top = tree.nodes.find((n: any) => n.id === fixture_id)
    const segments = tree.nodes.filter((n: any) => n.id !== fixture_id)

    const plain = (list: any[]) => list.map((r: any) => r.data$(false))
    const q = { org_id: top.org_id }

    // Speakers are included WITHOUT email even here: the grid never needs it,
    // and a field that is not fetched cannot be leaked by a later change to
    // how the app renders (C6).
    const speakers = plain(await seneca.entity('cag/speaker').list$(q)).map((s: any) => ({
      id: s.id,
      name: s.name,
    }))

    return {
      ok: true,
      tops,
      top,
      segments,
      rooms: plain(await seneca.entity('cag/room').list$(q)),
      tracks: plain(await seneca.entity('cag/track').list$(q)),
      speakers,
      appearances: plain(await seneca.entity('cag/appearance').list$(q)),
    }
  }
}
