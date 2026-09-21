//// Browser proxy for aim:cag,remove:room.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,remove:room', 'cag/room', ['id'])
