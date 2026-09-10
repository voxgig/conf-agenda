//// Example gateway wrapper: forwards a web request to the internal
//// aim:thing,save:item message.

// module.exports = function make_web_save_item() {
//   return async function web_save_item(this: any, msg: any) {
//     const res = await this.post({ aim: 'thing', save: 'item', item: msg.item })
//     return res.ok ? { ok: true, item: res.item } : { ok: false }
//   }
// }
