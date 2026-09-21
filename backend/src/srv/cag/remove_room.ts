//// aim:cag,remove:room - the admin's Delete. Refuses while anything still
//// references the row, and declares no inverse: re-creating it would give it
//// a NEW id, so every reference to the old one would still be broken.
const { makeRemove } = require('./ent_intent')
module.exports = makeRemove('cag/room')
