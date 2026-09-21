//// Browser proxy for aim:cag,make:room. The editable field list IS the
//// whitelist - there is no key for a tenant, so none can be sent.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,make:room', 'cag/room', ['conference_id'])
