//// Browser proxy for aim:cag,update:appearance.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,update:appearance', 'cag/appearance', ['id'])
