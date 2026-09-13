// Gateway wrapper: change the SIGNED-IN user's password (from the cookie
// principal, never a caller-supplied id).
module.exports = function make_web_change_pass() {
  return async function web_change_pass(this: any, msg: any, meta: any) {
    const user = meta?.custom?.principal?.user
    if (!user) {
      return { ok: false, why: 'not-authenticated' }
    }
    return this.post('aim:auth,change:pass', {
      user_id: user.id,
      password: msg.password,
      repeat: msg.repeat,
    })
  }
}
