//// Browser proxy for aim:cag,apply:sync.

module.exports = function make_web_apply_sync() {
  return async function web_apply_sync(this: any, msg: any) {
    return this.post('aim:cag,apply:sync', {
      fixture_id: msg.fixture_id, confirm: true === msg.confirm,
    })
  }
}
