// The public content site (marketing pages) shown to signed-out visitors,
// with the login form. Static content — the app itself is behind auth.

import * as Hooks from '../hooks.js'

class VgPublic extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="vg-public">
        <header class="vg-public-nav">
          <span class="vg-brand">📋 Todo</span>
          <nav>
            <a href="#features">Features</a>
            <a href="#about">About</a>
          </nav>
        </header>

        <section class="vg-hero">
          <div class="vg-hero-copy">
            <h1>Plan together. Ship faster.</h1>
            <p>Organise work into projects, invite your team, and track every
              todo — a simple, collaborative workspace.</p>
          </div>
          <div class="vg-hero-auth">
            <vg-auth></vg-auth>
          </div>
        </section>

        <section id="features" class="vg-features">
          <h2>Features</h2>
          <div class="vg-feature-grid">
            <div class="vg-feature"><h3>Projects</h3>
              <p>Group work into projects and assign collaborators.</p></div>
            <div class="vg-feature"><h3>Todo lists</h3>
              <p>Break projects into lists and items, done when done.</p></div>
            <div class="vg-feature"><h3>Collaboration</h3>
              <p>Everyone assigned to a project sees and edits its work.</p></div>
          </div>
        </section>

        <section id="about" class="vg-about">
          <h2>About</h2>
          <p>A demonstration of a model-driven enterprise app: the entire UI
            — navigation, forms and entity relationships — is generated from
            the data model.</p>
        </section>

        ${Hooks.html('public:sections', {})}

        <footer class="vg-public-footer">
          <span>&copy; Todo. A Voxgig demo.</span>
        </footer>
      </div>`
  }
}

customElements.define('vg-public', VgPublic)
