import Crypto from 'node:crypto'

import { publicKey } from './apikey_util'

// aim:auth,create:apikey  { user_id, name }
// Create an API access key for the user. The raw key is returned ONCE
// (never stored): only its sha-256 hash is kept, plus a short prefix for
// display. Keys authenticate REST API calls (Authorization: Bearer).
module.exports = function make_create_apikey() {
  return async function create_apikey(this: any, msg: any) {
    const seneca = this
    const user_id = String(msg.user_id || '')
    const name = String(msg.name || '').trim()
    if ('' === user_id || '' === name) {
      return { ok: false, why: 'invalid-args' }
    }

    const key = 'vk_' + Crypto.randomBytes(24).toString('hex')
    const hash = Crypto.createHash('sha256').update(key).digest('hex')

    const item = await seneca.entity('sys/apikey').data$({
      user_id,
      name,
      hash,
      prefix: key.slice(0, 8),
      revoked: false,
      t_c: Date.now(),
    }).save$()

    return { ok: !!item, key, item: publicKey(item) }
  }
}
