//// aim:cag,move:segment - drag, and Shift-arrows, from the agenda grid.
////
//// THE RESULT OF A DRAG IS AN INTENT, NOT A PAYLOAD (SPEC 9). The message
//// carries the TARGET room and start; the server works out the rest. A
//// browser that computed the new row would BE the business rule, unreviewably.
////
//// A MOVE THAT CREATES A CLASH STILL SAVES. Validation gates publish and
//// apply:sync (SPEC 16), not editing - an organiser rebuilding a schedule
//// the night before has to be able to pass through an invalid state. The
//// header's error count is how they see it, and GridMove.dc.html draws
//// exactly that: the moved card lands, and two cards go red.

const { loadRow, checkRefs, saveRow, pick } = require('./intent_util')

module.exports = function make_move_segment() {
  return async function move_segment(this: any, msg: any) {
    const seneca = this

    const row = await loadRow(seneca, 'cag/fixture', msg.fixture_id)
    if (null == row) return { ok: false, why: 'not-found' }
    const stored = row.data$(false)

    // Exactly what this intent's declared `inverse` map reads, and no more.
    const prev = pick(stored, ['room_id', 't_start'])

    const changes: any = {}
    if (null != msg.room_id) changes.room_id = String(msg.room_id)

    // Cross-tenant at SAVE time (SPEC 16.1), not only at validate: a user
    // with access to two orgs must not graft this org's session onto
    // another's room.
    const why = await checkRefs(seneca, stored, changes)
    if (null != why) return { ok: false, why }

    // A MOVE PRESERVES DURATION. The grid hands over a slot, not a span, so
    // t_end follows from t_start - which is also what makes the inverse
    // exact: moving back to the old start restores the old end.
    const t_start = Number(msg.t_start)
    if (!Number.isFinite(t_start)) return { ok: false, why: 'bad-t-start' }

    const oldStart = Number(stored.t_start)
    const oldEnd = Number(stored.t_end)
    const span = Number.isFinite(oldStart) && Number.isFinite(oldEnd) ? oldEnd - oldStart : null

    changes.t_start = t_start
    if (null != span) changes.t_end = t_start + span

    const item = await saveRow(seneca, row, changes)
    return { ok: true, item, prev }
  }
}
