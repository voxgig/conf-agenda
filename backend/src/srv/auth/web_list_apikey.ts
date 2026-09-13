// Gateway wrapper: list the SIGNED-IN user's API keys.
module.exports = function make_web_list_apikey() {
  return async function web_list_apikey(this: any, _msg: any, meta: any) {
    const user = meta?.custom?.principal?.user
    if (!user) {
      return { ok: false, why: 'not-authenticated' }
    }
    return this.post('aim:auth,list:apikey', { user_id: user.id })
  }
}
