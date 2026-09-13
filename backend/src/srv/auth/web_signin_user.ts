// Gateway signin: on success the gateway$ auth token result field makes
// gateway-auth (express_cookie) set the auth cookie.
module.exports = function make_web_signin_user() {
  return async function web_signin_user(this: any, msg: any) {
    const res = await this.post('aim:auth,signin:user', {
      email: msg.email,
      password: msg.password,
    })

    const out: any = { ok: res.ok }
    if (res.ok) {
      out.gateway$ = { auth: { token: res.login.token } }
      out.user = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.name,
        handle: res.user.handle,
      }
    }
    else {
      out.why = res.why
    }
    return out
  }
}
