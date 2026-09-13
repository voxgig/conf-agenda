// User settings & security: update profile and change password. Backed by
// the auth service wrappers (aim:req,on:auth,{update:user,change:pass}).

import { bus } from '../bus.js'
import * as Api from '../api.js'
import * as Hooks from '../hooks.js'


class VgSettings extends HTMLElement {
  async connectedCallback() {
    const state = await bus.post('cmp:auth,get:state')
    this.user = state.user || {}
    this.apikeys = []
    this.newKey = null
    this.render()
    this.loadKeys()
  }

  async loadKeys() {
    const res = await Api.listApikeys()
    this.apikeys = (res.ok && res.items) || []
    if (this.isConnected) {
      this.renderKeys()
    }
  }

  render() {
    this.innerHTML = `
      <div class="vg-entity vg-settings">
        <h2>Settings &amp; security</h2>

        <section class="vg-card">
          <h3>Profile</h3>
          <form class="vg-entity-form" id="vg-profile">
            <label>Name <input name="name" type="text" value="${esc(this.user.name)}" /></label>
            <label>Email <input type="email" value="${esc(this.user.email)}" disabled /></label>
            <div class="vg-form-actions"><button type="submit" class="vg-primary">Save profile</button></div>
            <div class="vg-form-msg" id="vg-profile-msg"></div>
          </form>
        </section>

        <section class="vg-card">
          <h3>Change password</h3>
          <form class="vg-entity-form" id="vg-pass">
            <label>New password <input name="password" type="password" required minlength="8" /></label>
            <label>Confirm <input name="confirm" type="password" required minlength="8" /></label>
            <div class="vg-form-actions"><button type="submit" class="vg-primary">Change password</button></div>
            <div class="vg-form-msg" id="vg-pass-msg"></div>
          </form>
        </section>

        <section class="vg-card">
          <h3>API keys</h3>
          <p class="vg-muted">Access the REST API (<code>/api/v1/…</code>) with
            <code>Authorization: Bearer &lt;key&gt;</code>. A key is shown
            only once, at creation.</p>
          <form class="vg-entity-form vg-apikey-form" id="vg-apikey-create">
            <label>Name <input name="name" type="text" required placeholder="e.g. ci-deploy" /></label>
            <div class="vg-form-actions"><button type="submit" class="vg-primary">Create key</button></div>
            <div class="vg-form-msg" id="vg-apikey-msg"></div>
          </form>
          <div id="vg-apikey-new"></div>
          <div id="vg-apikey-list"></div>
        </section>

        ${Hooks.html('settings:sections', { user: this.user })}
      </div>`

    this.querySelector('#vg-profile').onsubmit = async (ev) => {
      ev.preventDefault()
      const name = ev.target.querySelector('[name=name]').value
      const res = await Api.updateUser({ name })
      const msg = this.querySelector('#vg-profile-msg')
      if (res.ok) {
        this.user.name = res.user ? res.user.name : name
        msg.textContent = 'Profile saved.'
        msg.className = 'vg-form-msg vg-ok'
      }
      else {
        msg.textContent = 'Save failed: ' + (res.why || '')
        msg.className = 'vg-form-msg vg-err'
      }
    }

    this.querySelector('#vg-apikey-create').onsubmit = async (ev) => {
      ev.preventDefault()
      const name = ev.target.querySelector('[name=name]').value.trim()
      const msg = this.querySelector('#vg-apikey-msg')
      const res = await Api.createApikey(name)
      if (res.ok) {
        ev.target.reset()
        this.newKey = res.key
        msg.textContent = ''
        await this.loadKeys()
      }
      else {
        msg.textContent = 'Create failed: ' + (res.why || '')
        msg.className = 'vg-form-msg vg-err'
      }
    }
    this.renderKeys()

    this.querySelector('#vg-pass').onsubmit = async (ev) => {
      ev.preventDefault()
      const pw = ev.target.querySelector('[name=password]').value
      const confirm = ev.target.querySelector('[name=confirm]').value
      const msg = this.querySelector('#vg-pass-msg')
      if (pw !== confirm) {
        msg.textContent = 'Passwords do not match.'
        msg.className = 'vg-form-msg vg-err'
        return
      }
      const res = await Api.changePass(pw)
      if (res.ok) {
        ev.target.reset()
        msg.textContent = 'Password changed.'
        msg.className = 'vg-form-msg vg-ok'
      }
      else {
        msg.textContent = 'Change failed: ' + (res.why || '')
        msg.className = 'vg-form-msg vg-err'
      }
    }
  }

  // The API-keys list (re-rendered after create/revoke). The freshly
  // created key is shown ONCE (it is never retrievable again).
  renderKeys() {
    const fresh = this.querySelector('#vg-apikey-new')
    if (fresh) {
      fresh.innerHTML = this.newKey ? `
        <div class="vg-apikey-once">
          <strong>Copy your new key now — it will not be shown again:</strong>
          <code class="vg-apikey-value">${esc(this.newKey)}</code>
        </div>` : ''
    }

    const list = this.querySelector('#vg-apikey-list')
    if (!list) {
      return
    }
    list.innerHTML = this.apikeys.length ? `
      <table class="vg-table vg-apikey-table">
        <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${this.apikeys.map((k) => `
            <tr data-id="${esc(k.id)}">
              <td>${esc(k.name)}</td>
              <td><code>${esc(k.prefix)}…</code></td>
              <td>${k.t_c ? new Date(k.t_c).toISOString().slice(0, 10) : ''}</td>
              <td>${k.revoked ? 'revoked' : 'active'}</td>
              <td>${k.revoked ? '' :
                `<button type="button" class="vg-apikey-revoke" data-id="${esc(k.id)}">Revoke</button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="vg-muted">No API keys yet.</p>'

    for (const btn of list.querySelectorAll('.vg-apikey-revoke')) {
      btn.onclick = async () => {
        const res = await Api.revokeApikey(btn.dataset.id)
        if (res.ok) {
          this.newKey = null
          await this.loadKeys()
        }
      }
    }
  }
}


function esc(s) {
  return String(null == s ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}


customElements.define('vg-settings', VgSettings)
