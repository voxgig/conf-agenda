// Shared helper for the auth actions (not an action file).
//
// Project a user down to the fields safe to send to a client. The
// @seneca/user entity carries the password hash (`pass`) and `salt`, and
// the `fields` option of sys:user,* does NOT restrict the user object it
// returns - so every action that answers with a user must project it
// here. aim:auth messages are reachable through the gateway, so this is
// the difference between a client seeing an email and seeing a hash.
export function publicUser(user: any) {
  if (null == user) {
    return undefined
  }
  const d = 'function' === typeof user.data$ ? user.data$(false) : user
  return {
    id: d.id,
    email: d.email,
    name: d.name,
    handle: d.handle,
  }
}
