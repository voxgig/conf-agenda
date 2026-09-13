//// aim:agenda,get:agenda - the one unauthenticated message (SPEC 9.1).
////
//// Anonymous: the embed runs on a third party's page and cannot carry
//// credentials. Published-only: it reads the frozen snapshot and never
//// composes from live rows, so draft and private content is not merely
//// filtered here - it was never written into what this reads.

module.exports = function make_get_agenda() {
  return async function get_agenda(this: any, msg: any) {
    const seneca = this

    const snapshot = await seneca
      .entity('cag/snapshot')
      .load$(msg.org_id + ':' + msg.slug)

    if (null == snapshot) {
      return { ok: false, why: 'not-published' }
    }

    return {
      ok: true,
      // The payload, verbatim as it was frozen. Nothing is computed here:
      // composing per request is what would let live data leak in.
      agenda: JSON.parse(snapshot.agenda_json),
      // The bytes, for a caller that wants to serve or hash them unchanged
      // (an ETag, the ejected bundle, the content hash).
      agenda_json: snapshot.agenda_json,
      schema_version: snapshot.schema_version,
      published_at: snapshot.published_at,
    }
  }
}
