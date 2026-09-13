//// Browser proxy for aim:cag,load:tree.
////
//// A proxy shares its LAST pattern pair with the message it forwards to, so
//// it must name its own action file (PLATFORM 1.4) - hence `file:` in
//// msg.aon and this file's name.

module.exports = function make_web_load_tree() {
  return async function web_load_tree(this: any, msg: any) {
    const args: any = {}
    if (null != msg.fixture_id) args.fixture_id = msg.fixture_id
    return this.post('aim:cag,load:tree', args)
  }
}
