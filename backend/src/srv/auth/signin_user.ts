import { publicUser } from './user_util'

// Sign a user in via @seneca/user login (email + password).
//
// The user is projected to safe fields: @seneca/user answers with the
// full entity (password hash + salt) regardless of the `fields` option,
// and aim:auth messages are reachable through the gateway.
module.exports = function make_signin_user() {
  return async function signin_user(this: any, msg: any) {
    const seneca = this

    const out = await seneca.post('sys:user,login:user', {
      email: msg.email,
      password: msg.password,
    })

    if (!out.ok) {
      return { ok: false, why: out.why }
    }

    return { ok: true, user: publicUser(out.user), login: out.login }
  }
}
