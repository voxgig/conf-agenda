//// Browser proxy for aim:cag,load:track.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,load:track', ['id'])
