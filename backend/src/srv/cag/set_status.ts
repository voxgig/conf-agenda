//// aim:cag,set:status - the `t` key, cycling draft -> confirmed -> cancelled.
////
//// The CYCLE lives in the UI; the intent takes the status it is being moved
//// to. A message called "cycle" would have no inverse worth declaring - you
//// cannot undo a cycle without knowing where it started - whereas
//// set:status inverts to set:status with the previous value.
////
//// Effective status is computed along the ancestor chain, most restrictive
//// wins (SPEC 8). This writes the node's OWN field; nothing here should ever
//// read it alone.

const { loadRow, saveRow, pick } = require('./intent_util')

const STATUS = ['draft', 'confirmed', 'cancelled']

module.exports = function make_set_status() {
  return async function set_status(this: any, msg: any) {
    const seneca = this

    const status = String(msg.status ?? '')
    if (!STATUS.includes(status)) return { ok: false, why: 'bad-status' }

    const row = await loadRow(seneca, 'cag/fixture', msg.fixture_id)
    if (null == row) return { ok: false, why: 'not-found' }
    const stored = row.data$(false)

    const prev = pick(stored, ['status'])
    const item = await saveRow(seneca, row, { status })
    return { ok: true, item, prev }
  }
}
