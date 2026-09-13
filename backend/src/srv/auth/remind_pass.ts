// aim:auth,remind:pass — password reminder. Creates a reset code but does
// NOT actually send an email (this is a demo); it logs what WOULD be sent.
// Always returns ok, regardless of whether the email exists, to avoid
// leaking which addresses are registered.
module.exports = function make_remind_pass() {
  return async function remind_pass(this: any, msg: any) {
    const email = String(msg.email || '').trim()
    if ('' === email) {
      return { ok: true }
    }

    const found = await this.post('sys:user,get:user', { email })
    if (found.ok && found.user) {
      let code = '(reset-code)'
      try {
        const v = await this.post('sys:user,make:verify', {
          user_id: found.user.id,
          kind: 'pass',
        })
        code = (v && ((v.verify && (v.verify.id || v.verify.code)) || v.id)) || code
      }
      catch (e) {
        // best-effort; the reminder is a stub
      }

      // IMPORTANT: no email is actually sent — just record what would be.
      this.log.info('password-reminder', { to: email, code, sent: false })
      // eslint-disable-next-line no-console
      console.log('[PASSWORD-REMINDER] (not sent) to=' + email + ' reset-code=' + code)
    }

    return { ok: true }
  }
}
