// Gateway wrapper: create an API key for the SIGNED-IN user (from the
// cookie principal, never a caller-supplied id).
module.exports = function make_web_create_apikey() {
  return async function web_create_apikey(this: any, msg: any, meta: any) {
    const user = meta?.custom?.principal?.user
    if (!user) {
      return { ok: false, why: 'not-authenticated' }
    }
    return this.post('aim:auth,create:apikey', {
      user_id: user.id,
      name: msg.name,
    })
  }
}
