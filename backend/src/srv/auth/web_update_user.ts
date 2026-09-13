// Gateway wrapper: update the SIGNED-IN user's profile.
module.exports = function make_web_update_user() {
  return async function web_update_user(this: any, msg: any, meta: any) {
    const user = meta?.custom?.principal?.user
    if (!user) {
      return { ok: false, why: 'not-authenticated' }
    }
    return this.post('aim:auth,update:user', { user_id: user.id, data: msg.data })
  }
}
