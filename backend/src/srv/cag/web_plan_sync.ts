//// Browser proxy for aim:cag,plan:sync.
////
//// aim:web is the only namespace the gateway accepts, and every entry in it
//// is a declared proxy to a real service message (SPEC 9).

module.exports = function make_web_plan_sync() {
  return async function web_plan_sync(this: any, msg: any) {
    return this.post('aim:cag,plan:sync', { fixture_id: msg.fixture_id })
  }
}
