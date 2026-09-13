//// Browser proxy for aim:cag,load:snapshot.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,load:snapshot', ['id'])
