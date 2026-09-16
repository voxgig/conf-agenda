// The public content site shown to signed-out visitors, with the login form.
//
// LIGHT, while the app is dark - and that is deliberate rather than an
// oversight. voxgig.com is light-first; the conf-agenda mockups in
// metsitaba/project-specs are dark. Both are the voxgig language: one is the
// marketing site, one is the product UI. This page is the marketing side, so
// it sets data-theme-mode="light" on <html> while mounted, and restores
// whatever was there on unmount. See backend/model/theme.aon.
//
// Structure follows voxgig.com's own: eyebrow -> oversized hero title with one
// accented word -> lede -> button row, then patterned feature cards and a stat
// row. Static content; the app itself is behind auth.

import * as Hooks from '../hooks.js'

// voxgig.com marks its feature cards with a per-card accent and a CSS-drawn
// background pattern. The icons are inline SVG so the page makes no external
// request and works offline.
const ICON = {
  clash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/>' +
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  embed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/>' +
    '<path d="m8 6-6 6 6 6"/></svg>',
  invite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/>' +
    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>' +
    '<path d="m9 16 2 2 4-4"/></svg>',
}

class VgPublic extends HTMLElement {
  connectedCallback() {
    // theme.css scopes each mode to :root[data-theme-mode], so the switch has
    // to happen on <html> - a data-theme-mode on this subtree would match
    // nothing. Set directly rather than through Theme.setMode(), which
    // persists: the visitor's choice of app mode is theirs, and a marketing
    // page is not the place to overwrite it. Restored on unmount, which is
    // when vg-app swaps in the shell after sign-in.
    this.prevMode = document.documentElement.getAttribute('data-theme-mode')
    document.documentElement.setAttribute('data-theme-mode', 'light')

    this.innerHTML = `
      <div class="vg-public">
        <header class="vg-public-nav">
          <span class="vg-brand"><span class="vg-brand-mark"></span>conf-agenda</span>
          <nav>
            <a href="#features">Features</a>
            <a href="#about">About</a>
          </nav>
        </header>

        <section class="vg-hero">
          <div class="vg-hero-copy">
            <p class="vg-eyebrow">Conference agendas</p>
            <h1>One agenda.<br><span class="vg-accent">Every output.</span></h1>
            <p>Build a conference programme once. Publish it to your own site,
              to calendar feeds, and to your speakers&rsquo; calendars &mdash;
              where a room change at 22:00 arrives as an update, never as a
              second invitation.</p>
            <div class="vg-btn-row">
              <a class="vg-btn vg-btn--primary" href="#features">See what it does</a>
              <a class="vg-btn vg-btn--ghost" href="#about">Why it is open source</a>
            </div>
          </div>
          <div class="vg-hero-auth">
            <vg-auth></vg-auth>
          </div>
        </section>

        <section id="features" class="vg-features">
          <p class="vg-eyebrow">Features</p>
          <h2>Built for the night before</h2>
          <div class="vg-feature-grid">
            <div class="vg-feature" data-pattern="dots" style="--card-accent: var(--vox-red)">
              <span class="vg-feature-mark">${ICON.clash}</span>
              <h3>Catch the clashes</h3>
              <p>Two talks in one room, or one speaker in two places, are found
                before you publish &mdash; not by an attendee. Every diagnostic
                names both sides.</p>
            </div>
            <div class="vg-feature" data-pattern="diagonal" style="--card-accent: var(--vox-teal)">
              <span class="vg-feature-mark">${ICON.embed}</span>
              <h3>Embed it anywhere</h3>
              <p>Two lines of markup put the agenda on your own site, styled to
                match. No framework, no build step, and you can take it with
                you.</p>
            </div>
            <div class="vg-feature" data-pattern="grid" style="--card-accent: var(--vox-blue)">
              <span class="vg-feature-mark">${ICON.invite}</span>
              <h3>Invitations that update</h3>
              <p>Speakers get one calendar entry that changes when the schedule
                does. Never a duplicate &mdash; which is the hard part, and the
                whole point.</p>
            </div>
          </div>
        </section>

        <section class="vg-stats">
          <div class="vg-stat-row">
            <div>
              <div class="vg-stat-big">3.2KB</div>
              <div class="vg-stat-label">the embed, gzipped</div>
            </div>
            <div>
              <div class="vg-stat-big">6</div>
              <div class="vg-stat-label">surfaces: app, API, SDKs, CLI, REPL, agents</div>
            </div>
            <div>
              <div class="vg-stat-big">1</div>
              <div class="vg-stat-label">model they are all generated from</div>
            </div>
          </div>
        </section>

        <section id="about" class="vg-about">
          <p class="vg-eyebrow">About</p>
          <h2>Open source, and yours to keep</h2>
          <p>conf-agenda is MIT licensed. The whole system is generated from one
            model &mdash; the app, the REST API, the SDKs, the CLI and the agent
            tools all read the same definitions, so they cannot drift apart. Run
            the hosted service, or host it yourself; the hosted one is a
            convenience, not a lock-in.</p>
        </section>

        ${Hooks.html('public:sections', {})}

        <footer class="vg-public-footer">
          <span class="vg-muted">&copy; conf-agenda. Open source, MIT, self-hostable.</span>
        </footer>
      </div>`
  }

  disconnectedCallback() {
    if (null == this.prevMode) document.documentElement.removeAttribute('data-theme-mode')
    else document.documentElement.setAttribute('data-theme-mode', this.prevMode)
  }
}

customElements.define('vg-public', VgPublic)
