//// aim:cag,remove:segment - the inverse of make:segment and
//// duplicate:segment (SPEC 9: duplicate "declares the removal of the copy").
////
//// IT DECLARES NO INVERSE OF ITS OWN, and that is deliberate rather than an
//// omission: restoring a deleted subtree is not an ordinary edit, and
//// PLATFORM 1.4 says a definition without an inverse "is not undoable, and
//// the UI must show it that way". The grid shows it by not offering `u`.
////
//// Appearances go with it. An appearance whose segment is gone is a row
//// nothing can reach and every speaker-facing rule has to special-case.

const { loadRow } = require('./intent_util')

module.exports = function make_remove_segment() {
  return async function remove_segment(this: any, msg: any) {
    const seneca = this

    const row = await loadRow(seneca, 'cag/fixture', msg.fixture_id)
    if (null == row) return { ok: false, why: 'not-found' }
    const stored = row.data$(false)

    // A SEGMENT CONTAINS NOTHING (SPEC 8.1), so anything with children is a
    // day or a conference and is not this intent's business. Removing one
    // here would strand its subtree, which is the C8 shape of bug.
    const children = await seneca.entity('cag/fixture').list$({ parent_id: stored.id })
    if (0 < children.length) return { ok: false, why: 'has-children' }

    for (const a of await seneca.entity('cag/appearance').list$({ fixture_id: stored.id })) {
      await seneca.entity('cag/appearance').remove$(a.id)
    }
    await seneca.entity('cag/fixture').remove$(stored.id)

    // No `prev`: nothing declares an inverse that would read one.
    return { ok: true, fixture_id: stored.id }
  }
}
