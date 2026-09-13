// End a login session.
//
// @seneca/user's logout:user needs a USER QUERY, not just a token: given
// only a token it answers `no-user-query` and leaves the sys/login row
// active - i.e. the token would keep working after sign-out. Pass the
// user id along with the token so the session is really revoked.
module.exports = function make_signout_user() {
  return async function signout_user(this: any, msg: any) {
    return this.post('sys:user,logout:user', {
      user_id: msg.user_id,
      token: msg.token,
    })
  }
}
