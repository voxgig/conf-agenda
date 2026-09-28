// The authenticated enterprise app shell: a traditional layout with a top
// bar (brand, project selector, user menu top-right) and a collapsible left
// menu listing the model's entities. The main area hosts the generic entity
// admin (or settings). Everything is driven by the model — the entity menu
// and relationships come from /model.json, so it scales to any graph.

import { bus, emit, onEvent } from '../bus.js'
import { NAV_CHORDS, inField, makeChords } from '../chords.js'
import * as Model from '../model.js'
import * as Api from '../api.js'
import * as Hooks from '../hooks.js'
import * as Theme from '../theme.js'


class VgShell extends HTMLElement {
  async connectedCallback() {
    await Model.loadModel()
    const state = await bus.post('cmp:auth,get:state')
    this.user = state.user
    this.projects = []
    this.currentProjectId = null
    this.currentCanon = null
    this.view = 'entity'
    this.collapsed = false

    this.renderFrame()
    if (this.hasProjects()) {
      await this.loadProjects()
    }

    // Land on projects if present, else the first entity.
    const ents = Model.entities()
    const start = ents.find((e) => 'proj/project' === e.canon) || ents[0]
    if (start) {
      this.openEntity(start.canon)
    }

    // The project selector refreshes when projects change (e.g. a new one is
    // created). Guard with isConnected: bus.sub has no auto-unsubscribe, so a
    // torn-down shell (sign-out→in re-mounts it) must not act on stale events.
    onEvent('navigate', ({ canon }) => {
      if (null != canon) this.openEntity(canon)
    })

    this.installChords()
    onEvent('projects-changed', () => {
      if (this.isConnected && this.hasProjects()) {
        this.loadProjects()
      }
    })
  }

  // ---- data ----

  // The project picker is part of the generated shell, but `proj/project` is
  // an entity a project may simply not have - conf-agenda does not. Listing a
  // canon the model never declared fetches nothing and leaves a permanently
  // empty "(no projects)" dropdown in the top bar, so the whole path is
  // skipped rather than the component forked.
  hasProjects() {
    return Model.entities().some((e) => 'proj/project' === e.canon)
  }

  async loadProjects() {
    this.projects = await Api.list('proj/project')
    if (!this.currentProjectId && this.projects.length) {
      this.currentProjectId = this.projects[0].id
    }
    this.renderProjectSelect()
    // A project-scoped view may need re-listing once projects are known.
    if ('entity' === this.view && this.admin && Model.isProjectScoped(this.currentCanon)) {
      this.admin.projectId = this.currentProjectId
      this.admin.reload()
    }
  }

  // ---- navigation ----

  /**
   * `g` then a letter, app-wide.
   *
   * ON THE DOCUMENT, because the grid is not mounted when you are looking at
   * the speaker list and `g a` has to work from there.
   *
   * IN THE CAPTURE PHASE, and that is the part that took a test to get right.
   * The grid's handler is on its own host, deeper in the tree, so on the way
   * UP it runs first: `g` then `d` armed the chord and then duplicated a
   * session, because `d` reached the grid before this ever saw it. Capture
   * gives the chord first refusal, and only on the keys it actually wants.
   *
   * It swallows exactly two things: a prefix, and whatever follows one. Every
   * other key is left alone and reaches the grid untouched.
   */
  installChords() {
    const chords = makeChords(NAV_CHORDS)

    this.onChordKey = (ev) => {
      // This listener has no auto-removal beyond disconnectedCallback, and a
      // sign-out then in re-mounts the shell: a stale one must not navigate.
      if (!this.isConnected) return
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (inField(ev.target)) return

      // An open dialog owns the keyboard. Navigating out from under a
      // confirmation leaves the thing it was confirming half-answered.
      if (document.querySelector('[role="dialog"]')) {
        chords.reset()
        return
      }

      const { target, swallowed } = chords.press(ev.key)
      if (!swallowed) return

      // Stop it reaching the grid. `d` and `t` are live bindings there, so a
      // mistyped `g d` would otherwise duplicate a session.
      ev.preventDefault()
      ev.stopPropagation()

      if (null != target) emit('navigate', { canon: target })
    }

    document.addEventListener('keydown', this.onChordKey, true)
  }

  disconnectedCallback() {
    if (this.onChordKey) document.removeEventListener('keydown', this.onChordKey, true)
  }

  openEntity(canon, detailId) {
    // Opening a project's detail makes it the current project, so children
    // created within it inherit the right project context.
    if ('proj/project' === canon && detailId) {
      this.currentProjectId = detailId
      this.renderProjectSelect()
    }
    this.currentCanon = canon
    this.view = 'entity'
    this.setActiveNav()
    this.mountAdmin(canon, detailId || null)
  }

  openSettings() {
    this.view = 'settings'
    this.setActiveNav()
    const main = this.querySelector('#vg-main')
    main.innerHTML = '<vg-settings></vg-settings>'
  }

  mountAdmin(canon, detailId) {
    const main = this.querySelector('#vg-main')
    // A custom view (ux:{view:'custom'}) replaces the generic admin.
    const tag = Model.customViewTag(canon) || 'vg-entity-admin'
    if (!this.admin || this.admin.parentNode !== main || this.admin.localName !== tag) {
      main.innerHTML = ''
      this.admin = document.createElement(tag)
      this.admin.onNavigate = (c, id) => this.openEntity(c, id)
      main.appendChild(this.admin)
    }
    this.admin.canon = canon
    this.admin.projectId = Model.isProjectScoped(canon) ? this.currentProjectId : null
    this.admin.detailId = detailId
    this.admin.reload()
  }

  // ---- render ----

  renderFrame() {
    this.innerHTML = `
      <div class="vg-shell${this.collapsed ? ' vg-collapsed' : ''}">
        <header class="vg-topbar">
          <button class="vg-icon-btn" id="vg-toggle" title="Menu">☰</button>
          <span class="vg-brand"><span class="vg-brand-mark"></span>conf-agenda</span>
          ${this.hasProjects() ? `
          <div class="vg-project-picker">
            <label>Project</label>
            <select id="vg-project"></select>
          </div>` : ''}
          <div class="vg-spacer"></div>
          ${Hooks.html('shell:topbar:right', { user: this.user })}
          <div class="vg-usermenu" id="vg-usermenu">
            <button class="vg-user-btn" id="vg-user-btn">
              <span>${this.user ? this.user.email : ''}</span> <span class="vg-caret">▾</span>
            </button>
            <div class="vg-user-dropdown" id="vg-user-dropdown" hidden>
              ${Theme.modes().length > 1
                ? `<a href="#" id="vg-theme-toggle">Theme: ${esc(Theme.current())}</a>` : ''}
              <a href="#" id="vg-nav-settings">Settings &amp; security</a>
              <a href="#" id="vg-signout">Sign out</a>
            </div>
          </div>
        </header>
        <div class="vg-body">
          <aside class="vg-sidebar">
            ${Hooks.html('shell:sidebar:top', { user: this.user })}
            <input class="vg-ent-filter" id="vg-ent-filter" placeholder="Filter…" />
            <nav id="vg-entnav"></nav>
          </aside>
          <main class="vg-main" id="vg-main"></main>
        </div>
      </div>`

    this.querySelector('#vg-toggle').onclick = () => {
      this.collapsed = !this.collapsed
      this.querySelector('.vg-shell').classList.toggle('vg-collapsed', this.collapsed)
    }

    const userBtn = this.querySelector('#vg-user-btn')
    const dropdown = this.querySelector('#vg-user-dropdown')
    userBtn.onclick = (ev) => {
      ev.stopPropagation()
      dropdown.hidden = !dropdown.hidden
    }
    document.addEventListener('click', () => { dropdown.hidden = true })

    const themeToggle = this.querySelector('#vg-theme-toggle')
    if (themeToggle) {
      themeToggle.onclick = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        themeToggle.textContent = 'Theme: ' + Theme.nextMode()
      }
    }
    this.querySelector('#vg-nav-settings').onclick = (ev) => {
      ev.preventDefault()
      dropdown.hidden = true
      this.openSettings()
    }
    this.querySelector('#vg-signout').onclick = async (ev) => {
      ev.preventDefault()
      await bus.post('cmp:auth,signout:user')
    }

    const proj = this.querySelector('#vg-project')
    if (proj) {
      proj.onchange = (ev) => {
        this.currentProjectId = ev.target.value
        if ('entity' === this.view && Model.isProjectScoped(this.currentCanon)) {
          this.admin.projectId = this.currentProjectId
          this.admin.reload()
        }
      }
    }

    const filter = this.querySelector('#vg-ent-filter')
    filter.oninput = () => this.renderNav(filter.value)

    this.renderNav('')
  }

  renderProjectSelect() {
    const sel = this.querySelector('#vg-project')
    if (!sel) {
      return
    }
    sel.innerHTML = this.projects.length
      ? this.projects.map((p) =>
          `<option value="${p.id}"${p.id === this.currentProjectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')
      : '<option value="">(no projects)</option>'
  }

  // The entity menu, grouped by zone, filterable (scales to many entities).
  renderNav(filter) {
    const nav = this.querySelector('#vg-entnav')
    const f = (filter || '').toLowerCase()
    // Hook: reorder/filter/relabel the entity menu.
    const all = Hooks.filter('shell:nav:items', Model.entities(), {})
    const ents = all.filter((e) => e.canon.toLowerCase().indexOf(f) >= 0)
    const byZone = {}
    for (const e of ents) {
      (byZone[e.zone] = byZone[e.zone] || []).push(e)
    }
    nav.innerHTML = Object.keys(byZone).sort().map((zone) => `
      <div class="vg-navgroup">
        <div class="vg-navgroup-title">${esc(Model.titleize(zone))}</div>
        ${byZone[zone].map((e) =>
          `<a href="#" class="vg-navlink${e.canon === this.currentCanon ? ' vg-sel' : ''}"
             data-canon="${e.canon}">${esc(e.label)}</a>`).join('')}
      </div>`).join('')
    // THE CLICK POSTS A MESSAGE; THE MESSAGE NAVIGATES. Not because a click
    // handler calling a method is wrong, but because PLATFORM 1.2 puts
    // navigation on the in-browser bus - and a journey that cannot be driven
    // without a pointer is one the bus-drive spec cannot prove (PLATFORM 10).
    // Two paths to openEntity() is how they drift; one is why this exists.
    for (const a of nav.querySelectorAll('.vg-navlink')) {
      a.onclick = (ev) => {
        ev.preventDefault()
        emit('navigate', { canon: a.dataset.canon })
      }
    }
  }

  setActiveNav() {
    for (const a of this.querySelectorAll('.vg-navlink')) {
      a.classList.toggle('vg-sel', 'entity' === this.view && a.dataset.canon === this.currentCanon)
    }
  }
}


function esc(s) {
  return String(null == s ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}


customElements.define('vg-shell', VgShell)
