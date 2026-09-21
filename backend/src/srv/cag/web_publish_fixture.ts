//// Browser proxy for aim:cag,publish:fixture.
////
//// NO `confirm` PARAM, and the difference from apply:sync is the point.
//// Applying a sync reaches real speakers' calendars, so C4 puts the
//// confirmation IN the message - an unconfirmed call is refused by the
//// server. Publishing makes an agenda public: it is the organiser's own
//// data, it gates on validate:fixture (errors block it, SPEC 16), and SPEC 9
//// declares unpublish:fixture as its inverse-in-spirit.
////
//// So the confirmation for publish is a SCREEN (mockups/src/PublishConfirm
//// .dc.html, reached with `P`), which states what changed since the last
//// publish. A screen can be skipped by a caller; a message param cannot -
//// and that is exactly the distinction between the two.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,publish:fixture', ['fixture_id'])
