// Auth: a seneca plugin holding the signed-in principal (state), and the
// <vg-auth> login form used on the public site. The signed-in UI lives in
// the app shell's user menu, not here.

import { bus, emit } from '../bus.js'
import { remindPass } from '../api.js'
import * as Hooks from '../hooks.js'


bus.use(function auth_cmp() {
  const seneca = this

  let user = null

  seneca.add('cmp:auth,get:state', function (msg, reply) {
    reply({ ok: true, user })
  })

  // Resolve current auth from the backend (cookie session).
  seneca.add('cmp:auth,load:state', function (msg, reply) {
    this.act('aim:web,on:auth,load:auth', function (err, out) {
      user = (!err && out.ok && 'signedin' === out.state) ? out.user : null
      emit('auth', { user })
      reply({ ok: true, user })
    })
  })

  seneca.add('cmp:auth,signin:user', function (msg, reply) {
    this.act('aim:web,on:auth,signin:user', {
      email: msg.email,
      password: msg.password,
    }, function (err, out) {
      if (err || !out.ok) {
        return reply({ ok: false, why: (out && out.why) || 'signin-failed' })
      }
      user = out.user
      emit('auth', { user })
      reply({ ok: true, user })
    })
  })

  seneca.add('cmp:auth,signout:user', function (msg, reply) {
    this.act('aim:web,on:auth,signout:user', function () {
      user = null
      emit('auth', { user })
      reply({ ok: true })
    })
  })
})


// The public login form (+ a forgot-password flow that never actually
// emails — the backend logs the reset code).
class VgAuth extends HTMLElement {
  connectedCallback() {
    this.mode = 'signin'
    this.render()
  }

  render() {
    if ('forgot' === this.mode) {
      this.renderForgot()
    }
    else {
      this.renderSignin()
    }
  }

  renderSignin() {
    this.innerHTML = `
      <form class="vg-auth-form">
        <h2>Sign in</h2>
        <label>Email <input name="email" type="email" required /></label>
        <label>Password <input name="password" type="password" required /></label>
        <button type="submit">Sign in</button>
        <a href="#" class="vg-link" id="vg-forgot">Forgot password?</a>
        ${Hooks.html('auth:form:footer', {})}
        <div class="vg-auth-err" id="vg-auth-err"></div>
      </form>`
    this.querySelector('#vg-forgot').onclick = (ev) => {
      ev.preventDefault()
      this.mode = 'forgot'
      this.render()
    }
    this.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault()
      const fd = new FormData(ev.target)
      const res = await bus.post('cmp:auth,signin:user', {
        email: fd.get('email'),
        password: fd.get('password'),
      })
      if (!res.ok) {
        this.querySelector('#vg-auth-err').textContent = 'Sign in failed: ' + res.why
      }
    }
  }

  renderForgot() {
    this.innerHTML = `
      <form class="vg-auth-form">
        <h2>Reset password</h2>
        <p class="vg-hint">Enter your email and we'll send a reset link.</p>
        <label>Email <input name="email" type="email" required /></label>
        <button type="submit">Send reset link</button>
        <a href="#" class="vg-link" id="vg-back">Back to sign in</a>
        <div class="vg-auth-msg" id="vg-auth-msg"></div>
      </form>`
    this.querySelector('#vg-back').onclick = (ev) => {
      ev.preventDefault()
      this.mode = 'signin'
      this.render()
    }
    this.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault()
      const fd = new FormData(ev.target)
      await remindPass(fd.get('email'))
      // Always the same message (no user enumeration; nothing is actually sent).
      this.querySelector('#vg-auth-msg').textContent =
        'If that email is registered, a reset link has been sent.'
    }
  }
}

customElements.define('vg-auth', VgAuth)
