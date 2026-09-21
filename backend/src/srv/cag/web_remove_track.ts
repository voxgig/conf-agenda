//// Browser proxy for aim:cag,remove:track.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,remove:track', 'cag/track', ['id'])
