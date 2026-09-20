//// aim:cag,add:appearance - a speaker onto a session.
////
//// An appearance is the join, and it is what the calendar reacts to: the
//// invitation belongs to the appearance, so adding one person changes one
//// attendee set rather than recreating an event.
////
//// Tenancy comes from the SEGMENT, which is the stored row here.

const { loadRow, checkRefs, nowOf, tidy } = require('./intent_util')

const ROLES = ['speaker', 'host', 'panellist', 'mentor']

module.exports = function make_add_appearance() {
  return async function add_appearance(this: any, msg: any) {
    const seneca = this

    const fixture = await loadRow(seneca, 'cag/fixture', msg.fixture_id)
    if (null == fixture) return { ok: false, why: 'not-found' }
    const stored = fixture.data$(false)

    const role = String(msg.role ?? 'speaker')
    if (!ROLES.includes(role)) return { ok: false, why: 'bad-role' }

    const why = await checkRefs(seneca, stored, { speaker_id: msg.speaker_id })
    if (null != why) return { ok: false, why }

    // ALREADY ON IT IS NOT AN ERROR, AND NOT A SECOND ROW. Two appearances
    // for one speaker on one session is two attendee entries and, at the
    // ledger, an event whose attendee set never settles.
    const existing = (await seneca.entity('cag/appearance').list$({
      fixture_id: String(msg.fixture_id), speaker_id: String(msg.speaker_id),
    }))[0]
    if (null != existing) {
      return { ok: true, item: tidy(existing.data$(false)), appearance_id: existing.id }
    }

    const t = nowOf(seneca)
    const order = (await seneca.entity('cag/appearance')
      .list$({ fixture_id: String(msg.fixture_id) })).length

    const saved = await seneca.entity('cag/appearance').make$().data$({
      ...(null == stored.org_id ? {} : { org_id: stored.org_id }),
      fixture_id: String(msg.fixture_id),
      speaker_id: String(msg.speaker_id),
      role,
      invite: 'none',
      order,
      t_c: t,
      t_m: t,
    }).save$()

    const item = tidy(saved.data$(false))
    return { ok: true, item, appearance_id: item.id }
  }
}
