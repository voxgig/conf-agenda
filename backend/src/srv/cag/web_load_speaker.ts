//// Browser proxy for aim:cag,load:speaker.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,load:speaker', ['id'])
