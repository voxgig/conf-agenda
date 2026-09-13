// aim:auth,update:user — update the current user's profile (name, etc.).
module.exports = function make_update_user() {
  return async function update_user(this: any, msg: any) {
    const res = await this.post('sys:user,update:user', {
      user_id: msg.user_id,
      user_data: msg.data || {},
    })
    if (!res.ok) {
      return { ok: false, why: res.why || 'update-failed' }
    }
    const u = res.user || {}
    return { ok: true, user: { id: u.id, name: u.name, email: u.email, handle: u.handle } }
  }
}
