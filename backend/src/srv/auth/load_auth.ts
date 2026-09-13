import { publicUser } from './user_util'

// Load the auth state for a user id. The user is projected to safe
// fields (never the password hash or salt) - see user_util.
module.exports = function make_load_auth() {
  return async function load_auth(this: any, msg: any) {
    const user = await this.entity('sys/user').load$(msg.user_id)
    return {
      ok: !!user,
      state: user ? 'signedin' : 'signedout',
      user: publicUser(user),
    }
  }
}
