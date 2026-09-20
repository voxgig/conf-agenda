//// aim:cag,make:segment - the `n` key, a new session in the focused cell.
////
//// TENANCY COMES FROM THE PARENT, which is the stored row here: a new
//// segment inherits the org of the fixture it is created under, and the
//// message has no org_id to offer.
////
//// The cycle guard cannot fire for a row that does not exist yet, but the
//// KIND rules can - a segment under a segment, or under nothing, is
//// bad-parent-kind (SPEC 16.1) and is refused before storing.

const { loadRow, checkRefs, checkParent, nowOf, tidy } = require('./intent_util')

/** A plain talk. The organiser retypes it in the card, not in a dialog. */
const DEFAULT_KIND = 'tak'

module.exports = function make_make_segment() {
  return async function make_segment(this: any, msg: any) {
    const seneca = this

    const parent = await loadRow(seneca, 'cag/fixture', msg.parent_id)
    if (null == parent) return { ok: false, why: 'not-found' }
    const parentRow = parent.data$(false)

    const kind = String(msg.kind ?? DEFAULT_KIND)
    const why = await checkParent(seneca, null, msg.parent_id, kind)
    if (null != why) return { ok: false, why }

    const t_start = Number(msg.t_start)
    const t_end = Number(msg.t_end)
    if (!Number.isFinite(t_start) || !Number.isFinite(t_end)) {
      return { ok: false, why: 'bad-times' }
    }
    // negative-duration is a model must() as well as a rule (SPEC 16.1), so
    // an intent that produced one would fail at the store with a shape error
    // rather than a reason the organiser can act on.
    if (t_end <= t_start) return { ok: false, why: 'negative-duration' }

    const changes: any = {}
    if (null != msg.room_id) changes.room_id = String(msg.room_id)
    const refWhy = await checkRefs(seneca, parentRow, changes)
    if (null != refWhy) return { ok: false, why: refWhy }

    const t = nowOf(seneca)
    const saved = await seneca.entity('cag/fixture').make$().data$({
      ...(null == parentRow.org_id ? {} : { org_id: parentRow.org_id }),
      parent_id: String(msg.parent_id),
      // Denormalised, and server-managed: the client never sets it.
      ...(null == parentRow.top_id
        ? { top_id: String(parentRow.id) }
        : { top_id: String(parentRow.top_id) }),
      kind,
      title: String(msg.title ?? 'New session'),
      t_start,
      t_end,
      ...changes,
      // A new session starts as a DRAFT. It is not in the programme until
      // somebody says so, and the public path never carries a draft.
      status: 'draft',
      t_c: t,
      t_m: t,
    }).save$()

    const item = tidy(saved.data$(false))
    // fixture_id at the top level: the declared inverse (remove:segment) maps
    // from `result.fixture_id`, and a map should not have to reach into item.
    return { ok: true, item, fixture_id: item.id }
  }
}
