//// Browser proxy for aim:cag,remove:speaker.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,remove:speaker', 'cag/speaker', ['id'])
