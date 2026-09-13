//// Browser proxy for aim:cag,load:appearance.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,load:appearance', ['id'])
