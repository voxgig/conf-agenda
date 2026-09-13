import { publicKey } from './apikey_util'

// aim:auth,list:apikey  { user_id }
// List the user's API keys (hashes never leave the service).
module.exports = function make_list_apikey() {
  return async function list_apikey(this: any, msg: any) {
    const user_id = String(msg.user_id || '')
    if ('' === user_id) {
      return { ok: false, why: 'invalid-args' }
    }
    const list = await this.entity('sys/apikey').list$({ user_id })
    return { ok: true, items: list.map(publicKey) }
  }
}
