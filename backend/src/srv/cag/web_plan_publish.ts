//// Browser proxy for aim:cag,plan:publish. Read-only: it computes what
//// publishing would change and publishes nothing.
const { makeWebProxy } = require('./ent_util')
module.exports = makeWebProxy('aim:cag,plan:publish', ['fixture_id'])
