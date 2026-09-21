//// Browser proxy for aim:cag,update:track.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,update:track', 'cag/track', ['id'])
