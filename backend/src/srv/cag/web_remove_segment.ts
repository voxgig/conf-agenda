//// Browser proxy for aim:cag,remove:segment.
////
//// `pick` IS THE WHITELIST, and that is the point: the browser cannot add a
//// key this list does not name, so an org_id smuggled into the payload is
//// dropped before the message is forwarded. Tenancy comes from the stored
//// row on the other side (PLATFORM 1.2).
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,remove:segment', ['fixture_id'])
