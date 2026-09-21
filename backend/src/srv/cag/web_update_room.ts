//// Browser proxy for aim:cag,update:room.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,update:room', 'cag/room', ['id'])
