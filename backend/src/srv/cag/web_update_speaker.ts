//// Browser proxy for aim:cag,update:speaker.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,update:speaker', 'cag/speaker', ['id'])
