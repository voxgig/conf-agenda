// Gateway wrapper: revoke one of the SIGNED-IN user's API keys.
module.exports = function make_web_revoke_apikey() {
  return async function web_revoke_apikey(this: any, msg: any, meta: any) {
    const user = meta?.custom?.principal?.user
    if (!user) {
      return { ok: false, why: 'not-authenticated' }
    }
    return this.post('aim:auth,revoke:apikey', {
      user_id: user.id,
      id: msg.id,
    })
  }
}
