//// aim:cag,update:track - the admin's Edit, with exactly the editable
//// fields (SPEC 9). Never a generic canon-plus-item save.
const { makeUpdate } = require('./ent_intent')
module.exports = makeUpdate('cag/track')
