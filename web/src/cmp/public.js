// The public content site (marketing pages) shown to signed-out visitors,
// with the login form. Static content — the app itself is behind auth.

import * as Hooks from '../hooks.js'

class VgPublic extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="vg-public">
        <header class="vg-public-nav">
          <span class="vg-brand">🗓 conf-agenda</span>
          <nav>
            <a href="#features">Features</a>
            <a href="#about">About</a>
          </nav>
        </header>

        <section class="vg-hero">
          <div class="vg-hero-copy">
            <h1>One agenda. Every output.</h1>
            <p>Build a conference programme once. Publish it to your own site,
              to calendar feeds, and to your speakers&rsquo; calendars &mdash;
              where a room change at 22:00 arrives as an update, never as a
              second invitation.</p>
          </div>
          <div class="vg-hero-auth">
            <vg-auth></vg-auth>
          </div>
        </section>

        <section id="features" class="vg-features">
          <h2>Features</h2>
          <div class="vg-feature-grid">
            <div class="vg-feature"><h3>Catch the clashes</h3>
              <p>Two talks in one room, or one speaker in two places, are found
                before you publish &mdash; not by an attendee.</p></div>
            <div class="vg-feature"><h3>Embed it anywhere</h3>
              <p>Two lines of markup put the agenda on your own site, styled to
                match. Under 30KB, and you can take it with you.</p></div>
            <div class="vg-feature"><h3>Invitations that update</h3>
              <p>Speakers get one calendar entry that changes when the schedule
                does. Never a duplicate.</p></div>
          </div>
        </section>

        <section id="about" class="vg-about">
          <h2>About</h2>
          <p>conf-agenda is open source and MIT licensed. The whole system is
            generated from one model &mdash; the app, the REST API, the SDKs,
            the CLI and the agent tools all read the same definitions, so they
            cannot drift apart. Run the hosted service, or host it yourself;
            the hosted one is a convenience, not a lock-in.</p>
        </section>

        ${Hooks.html('public:sections', {})}

        <footer class="vg-public-footer">
          <span>&copy; conf-agenda. Open source, MIT, self-hostable.</span>
        </footer>
      </div>`
  }
}

customElements.define('vg-public', VgPublic)
