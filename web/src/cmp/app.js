// Top-level router: signed-out visitors see the public content site; signed-in
// users see the enterprise app shell. Driven by bus auth events.

import { bus, onEvent } from '../bus.js'


class VgApp extends HTMLElement {
  connectedCallback() {
    this.signedIn = undefined
    onEvent('auth', ({ user }) => this.route(user))
    // Resolve the cookie session on load.
    bus.post('cmp:auth,load:state')
  }

  route(user) {
    // Avoid needless re-mounts when the auth state hasn't actually changed.
    const signedIn = !!user
    if (this.signedIn === signedIn) {
      return
    }
    this.signedIn = signedIn
    this.innerHTML = signedIn ? '<vg-shell></vg-shell>' : '<vg-public></vg-public>'
  }
}

customElements.define('vg-app', VgApp)
