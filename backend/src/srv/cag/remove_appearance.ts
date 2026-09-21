//// aim:cag,remove:appearance - a speaker off a session.
////
//// Its declared inverse is add:appearance, which maps from `result.prev.*` -
//// so `prev` carries exactly the three fields that rebuild the row, read
//// from the appearance BEFORE it is deleted. Afterwards nothing says who was
//// on it, which is the same reason a calendar cancellation reads its spec
//// from the link rather than the live segment.

const { loadRow, pick } = require('./intent_util')

module.exports = function make_remove_appearance() {
  return async function remove_appearance(this: any, msg: any) {
    const seneca = this

    const row = await loadRow(seneca, 'cag/appearance', msg.appearance_id)
    if (null == row) return { ok: false, why: 'not-found' }
    const stored = row.data$(false)

    const prev = pick(stored, ['fixture_id', 'speaker_id', 'role'])
    await seneca.entity('cag/appearance').remove$(stored.id)

    return { ok: true, prev, appearance_id: stored.id }
  }
}
