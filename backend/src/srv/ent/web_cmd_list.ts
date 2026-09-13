// Browser proxy: aim:web,on:ent,cmd:list -> aim:ent,cmd:list
//
// aim:web is the only namespace the gateway accepts from a browser, so
// every entity operation a browser may perform is declared as one of
// these proxies. The principal the gateway resolved travels with the
// message (meta.custom), so the real action scopes by membership.
module.exports = function make_web_cmd_list() {
  return async function web_cmd_list(this: any, msg: any) {
    return this.post('aim:ent,cmd:list', {
      ent: msg.ent,
      id: msg.id,
      q: msg.q,
      item: msg.item,
    })
  }
}
