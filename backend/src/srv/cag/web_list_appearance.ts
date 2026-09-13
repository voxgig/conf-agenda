//// Browser proxy for aim:cag,list:appearance. Needs an explicit file: its last
//// pattern pair matches the message it forwards to (PLATFORM 1.4).
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,list:appearance', ['q'])
