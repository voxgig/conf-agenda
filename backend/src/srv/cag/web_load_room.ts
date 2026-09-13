//// Browser proxy for aim:cag,load:room.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,load:room', ['id'])
