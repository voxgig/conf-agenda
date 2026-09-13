// aim:auth,change:pass — change the current user's password via @seneca/user.
module.exports = function make_change_pass() {
  return async function change_pass(this: any, msg: any) {
    const res = await this.post('sys:user,change:pass', {
      user_id: msg.user_id,
      password: msg.password,
      repeat: msg.repeat,
    })
    return res.ok ? { ok: true } : { ok: false, why: res.why || 'change-failed' }
  }
}
