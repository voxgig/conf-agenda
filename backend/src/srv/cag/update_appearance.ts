//// aim:cag,update:appearance - role and order only.
////
//// An appearance's IDENTITY is (fixture_id, speaker_id); changing either is
//// remove-then-add, which is what the grid's add:appearance and
//// remove:appearance intents already are.
const { makeUpdate } = require('./ent_intent')
module.exports = makeUpdate('cag/appearance')
