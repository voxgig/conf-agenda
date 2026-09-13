// Gateway signout: revoke the session server-side, then tell
// gateway-auth (express_cookie) to clear the auth cookie.
module.exports = function make_web_signout_user() {
  return async function web_signout_user(this: any, _msg: any, meta: any) {
    const principal = meta.custom?.principal
    const token = principal?.token
    const user_id = principal?.user?.id

    if (token || user_id) {
      // Both are needed: a token alone does not revoke the login row.
      await this.post('aim:auth,signout:user', { user_id, token })
    }

    return { ok: true, gateway$: { auth: { remove: true } } }
  }
}
