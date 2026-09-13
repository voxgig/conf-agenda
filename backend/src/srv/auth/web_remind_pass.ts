// Gateway wrapper: public password-reminder request (no auth required).
module.exports = function make_web_remind_pass() {
  return async function web_remind_pass(this: any, msg: any) {
    return this.post('aim:auth,remind:pass', { email: msg.email })
  }
}
