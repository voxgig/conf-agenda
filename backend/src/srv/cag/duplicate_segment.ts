//// aim:cag,duplicate:segment - the `d` key.
////
//// SPEC 9: "copy the focused segment - the server clones the row and its
//// appearances, returning the new segment as a draft". The APPEARANCES are
//// the reason this is a message rather than a make:segment with the same
//// fields: a copy that loses its speakers is not a copy, and the browser
//// composing one would be the entity-save surface SPEC 9 forbids.
////
//// The copy is a DRAFT whatever the original was. Duplicating a confirmed
//// talk must not put a second confirmed talk in front of the speakers'
//// invitations before anyone has looked at it.

const { loadRow, nowOf, tidy } = require('./intent_util')

/** Server-managed or identity fields the copy must not inherit. */
const NOT_COPIED = ['id', 't_c', 't_m', 't_mh', 't_ch', 'owner_id', 'slug']

module.exports = function make_duplicate_segment() {
  return async function duplicate_segment(this: any, msg: any) {
    const seneca = this

    const row = await loadRow(seneca, 'cag/fixture', msg.fixture_id)
    if (null == row) return { ok: false, why: 'not-found' }
    const stored = row.data$(false)

    const fields: any = {}
    for (const k of Object.keys(stored)) {
      if (!NOT_COPIED.includes(k)) fields[k] = stored[k]
    }

    const t = nowOf(seneca)
    const saved = await seneca.entity('cag/fixture').make$().data$({
      ...fields,
      title: String(stored.title ?? 'Session') + ' (copy)',
      status: 'draft',
      t_c: t,
      t_m: t,
    }).save$()

    const copy = tidy(saved.data$(false))

    // The appearances come too, pointed at the copy. Order is preserved so
    // the card reads the same way round.
    const appearances = (await seneca.entity('cag/appearance')
      .list$({ fixture_id: stored.id }))
      .map((r: any) => r.data$(false))
      .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))

    for (const a of appearances) {
      const copied: any = {}
      for (const k of Object.keys(a)) {
        if (!NOT_COPIED.includes(k)) copied[k] = a[k]
      }
      await seneca.entity('cag/appearance').make$().data$({
        ...copied,
        fixture_id: copy.id,
        // NEVER the original's invitation state. A copy has been sent to
        // nobody, and inheriting `sent` would make the ledger disagree with
        // the calendar about an event that does not exist.
        invite: 'none',
        t_c: t,
        t_m: t,
      }).save$()
    }

    return { ok: true, item: copy, fixture_id: copy.id }
  }
}
