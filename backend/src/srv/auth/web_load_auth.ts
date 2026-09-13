// Current auth state, from the principal the gateway resolved (cookie).
module.exports = function make_web_load_auth() {
  return async function web_load_auth(this: any, _msg: any, meta: any) {
    const user = meta.custom?.principal?.user
    const out: any = { ok: true, state: 'signedout' }
    if (user) {
      out.state = 'signedin'
      out.user = { id: user.id, email: user.email, handle: user.handle }
    }
    return out
  }
}
