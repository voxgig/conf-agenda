import { publicKey } from './apikey_util'

// aim:auth,revoke:apikey  { user_id, id }
// Revoke one of the user's API keys. The record is kept (audit trail);
// revoked keys fail REST authentication immediately.
module.exports = function make_revoke_apikey() {
  return async function revoke_apikey(this: any, msg: any) {
    const seneca = this
    const user_id = String(msg.user_id || '')
    const id = String(msg.id || '')
    if ('' === user_id || '' === id) {
      return { ok: false, why: 'invalid-args' }
    }
    const item = await seneca.entity('sys/apikey').load$(id)
    if (null == item || item.user_id !== user_id) {
      return { ok: false, why: 'not-found' }
    }
    item.revoked = true
    const saved = await item.save$()
    return { ok: !!saved, item: publicKey(saved) }
  }
}
