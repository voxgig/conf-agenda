// Browser proxy: aim:web,on:ent,cmd:load -> aim:ent,cmd:load
//
// aim:web is the only namespace the gateway accepts from a browser, so
// every entity operation a browser may perform is declared as one of
// these proxies. The principal the gateway resolved travels with the
// message (meta.custom), so the real action scopes by membership.
module.exports = function make_web_cmd_load() {
  return async function web_cmd_load(this: any, msg: any) {
    return this.post('aim:ent,cmd:load', {
      ent: msg.ent,
      id: msg.id,
      q: msg.q,
      item: msg.item,
    })
  }
}
