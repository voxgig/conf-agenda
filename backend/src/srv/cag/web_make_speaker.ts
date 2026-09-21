//// Browser proxy for aim:cag,make:speaker. The editable field list IS the
//// whitelist - there is no key for a tenant, so none can be sent.
const { makeWebWrite } = require('./ent_intent')
module.exports = makeWebWrite('aim:cag,make:speaker', 'cag/speaker', ['conference_id'])
