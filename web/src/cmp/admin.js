// The generic entity admin: list / detail / form for ANY entity in the
// model, driven entirely by /model.json. Reference fields (a `ref` target
// canon) render as pickers in forms and clickable links in lists; a detail
// view shows an entity plus inline lists of everything that references it
// (inverse relationships), so you can navigate the whole graph.
//
// Backed by the ONE generic backend service (aim:ent,cmd:*) via api.js.
//
// Properties set by the shell: canon, projectId, detailId, onNavigate(canon,id).

import { emit } from '../bus.js'
import * as Model from '../model.js'
import * as Api from '../api.js'
import * as Hooks from '../hooks.js'


function esc(s) {
  return String(null == s ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}


// --- row overflow menus ------------------------------------------------------
// One open at a time, dismissed by Escape, by an outside click, or by opening
// another. The popup itself reuses .vg-user-dropdown (shell.js): a second
// bespoke menu style is how a small app starts to look assembled rather than
// designed.

function closeRowMenus(root) {
  // A CLOSED MENU IS A DISARMED ONE. The popup is hidden rather than
  // re-rendered, so an armed Delete would still read "Delete — confirm" the
  // next time it opened - and the second click would land on a confirmation
  // the organiser never gave.
  for (const armed of (root || document).querySelectorAll('.vg-del[data-state="armed"]')) {
    armed.dataset.state = ''
    armed.textContent = 'Delete'
    armed.classList.remove('vg-armed')
  }
  for (const btn of (root || document).querySelectorAll('.vg-rowmenu-btn[aria-expanded="true"]')) {
    btn.setAttribute('aria-expanded', 'false')
    const pop = btn.nextElementSibling
    if (pop) {
      pop.hidden = true
      // Drop the computed placement so the next open recomputes from scratch.
      pop.style.cssText = ''
    }
  }
}

// POSITION FIXED, placed from the trigger. The table wrapper has to clip - it
// is what rounds the corners and carries the horizontal scroll - so an
// absolutely-positioned menu is cut off on the last rows, which is exactly
// where it happened: 75px of the final row's menu sat outside the wrapper.
// Fixed positioning escapes the clip entirely.
function placeRowMenu(btn, pop) {
  const r = btn.getBoundingClientRect()
  const h = pop.offsetHeight
  const below = window.innerHeight - r.bottom
  pop.style.position = 'fixed'
  pop.style.right = (window.innerWidth - r.right) + 'px'
  // Flip up when there is no room below but there is above.
  // 'auto', not '': clearing the inline value falls back to the stylesheet's
  // own `top: 110%`, and a fixed element with BOTH top and bottom set is
  // stretched to fit between them - which collapsed the flipped menu to 10px.
  if (below < h + 8 && r.top > h + 8) {
    pop.style.top = 'auto'
    pop.style.bottom = (window.innerHeight - r.top + 4) + 'px'
  }
  else {
    pop.style.bottom = 'auto'
    pop.style.top = (r.bottom + 4) + 'px'
  }
}

function openRowMenu(btn) {
  btn.setAttribute('aria-expanded', 'true')
  const pop = btn.nextElementSibling
  if (!pop) return
  pop.hidden = false
  placeRowMenu(btn, pop)

  const first = pop.querySelector('[role=menuitem]:not([disabled])')
  if (first) first.focus()
}

if ('undefined' !== typeof document) {
  document.addEventListener('click', () => closeRowMenus(document))
  // A fixed menu does not travel with its row, so it is REPLACED on scroll
  // rather than closed. Closing looked simpler and was wrong: focusing the
  // trigger scrolls it into view, and that scroll arrives just after the menu
  // opens - so every menu near the bottom of a list shut itself immediately.
  const follow = () => {
    for (const btn of document.querySelectorAll('.vg-rowmenu-btn[aria-expanded="true"]')) {
      const pop = btn.nextElementSibling
      if (pop && !pop.hidden) placeRowMenu(btn, pop)
    }
  }
  window.addEventListener('scroll', follow, true)
  window.addEventListener('resize', follow)
  document.addEventListener('keydown', (ev) => {
    if ('Escape' !== ev.key) return
    const open = document.querySelector('.vg-rowmenu-btn[aria-expanded="true"]')
    if (!open) return
    closeRowMenus(document)
    // Focus goes back to the trigger, not to nowhere (K8).
    open.focus()
  })
}


class VgEntityAdmin extends HTMLElement {
  reload() {
    if (this.detailId) {
      this.showDetail(this.detailId)
    }
    else {
      this.showList()
    }
  }

  // Render token: async render methods capture it up-front and only commit
  // to the DOM if they are still the latest, so a slow/stale render can't
  // overwrite a newer one (fixes overlapping list/detail/form renders).
  begin() {
    return (this._tok = (this._tok || 0) + 1)
  }

  current(tok) {
    return tok === this._tok
  }

  navigate(canon, id) {
    if (this.onNavigate) {
      this.onNavigate(canon, id)
    }
  }

  // Map each reference field to { targetCanon, labels:{id->label} } so refs
  // render as human labels/links instead of raw ids.
  async refMaps(canon) {
    const maps = {}
    for (const r of Model.refsOf(canon)) {
      const rows = await Api.list(r.target)
      const lf = Model.labelField(r.target)
      const labels = {}
      for (const row of rows) {
        labels[row.id] = row[lf]
      }
      maps[r.field] = { target: r.target, labels }
    }
    return maps
  }

  // `where` is 'list' | 'detail' | 'child' - the same field often wants a
  // compact form in a table row and a full one on its own page.
  cell(canon, field, value, maps, where) {
    const fdef = Model.fieldsOf(canon)[field] || {}
    let out
    if (fdef.ref) {
      if (null == value) {
        out = '<span class="vg-muted">—</span>'
      }
      else {
        const m = maps[field] || { labels: {} }
        const label = m.labels[value] || value
        // Only link where there is somewhere to land. sys/org has no browser
        // read surface, so `org_tiny` rendered as a link that navigated
        // straight to "Not found." - a dead link is worse than plain text.
        out = Api.canRead(fdef.ref)
          ? `<a href="#" class="vg-ref" data-canon="${fdef.ref}" data-id="${esc(value)}">${esc(label)}</a>`
          : `<span class="vg-ref-flat" title="${esc(fdef.ref)}">${esc(label)}</span>`
      }
    }
    else if ('Boolean' === fdef.kind) {
      out = value ? '✓' : '<span class="vg-muted">✗</span>'
    }
    else {
      out = esc(value)
    }
    // Hook: render one field however the project likes. The generic admin
    // cannot know that a field holds a JSON document, a duration or a colour;
    // this is where a project says so, without forking the component.
    return Hooks.filter('admin:cell', out, {
      canon, field, value, where: where || 'list', fdef,
    })
  }

  wireRefLinks(root) {
    for (const a of root.querySelectorAll('.vg-ref')) {
      a.onclick = (ev) => {
        ev.preventDefault()
        this.navigate(a.dataset.canon, a.dataset.id)
      }
    }
  }

  // ---- list ----

  async showList() {
    const tok = this.begin()
    const canon = this.canon
    const pf = Model.projectRefField(canon)
    if ('proj/project' !== canon && pf && !this.projectId) {
      this.innerHTML = `<div class="vg-empty">Select or create a project to manage ${esc(Model.labelOf(canon))}.</div>`
      return
    }

    const q = {}
    if (pf && this.projectId) {
      q[pf] = this.projectId
    }
    let [items, maps] = await Promise.all([Api.list(canon, q), this.refMaps(canon)])
    if (!this.current(tok)) {
      return
    }
    // Hook: transform the item set (sort/filter/augment) and the columns.
    items = Hooks.filter('admin:list:items', items, { canon })
    const fields = Hooks.filter('admin:list:columns',
      Model.displayFields(canon).filter((f) => f !== pf), { canon })
    const labelName = Model.labelOf(canon)

    // One row, one overflow menu. Three bordered buttons per row means thirty
    // of them on a normal list, all competing with the data they act on; the
    // row itself becomes the Open target and the rest move behind the menu.
    // GATING IS PER ENTITY, not global. Most entities are writable now; a
    // published snapshot is not, because it is written by publishing rather
    // than by hand. A control that looks live and silently does nothing is
    // worse than one that is plainly disabled and says why - this component
    // used to ignore the refusal, so Delete re-rendered the list and looked
    // exactly like a successful delete of a row that was still there.
    const wr = Api.canWrite(canon)
      ? { off: '', why: '' }
      : { off: 'disabled', why: Api.writeBlockedReason(canon) }

    const rows = items.map((item) => {
      const name = item[Model.labelField(canon)] || item.id
      return `
      <tr data-row="${esc(item.id)}">
        ${fields.map((f) => `<td>${this.cell(canon, f, item[f], maps, 'list')}</td>`).join('')}
        <td class="vg-actions">
          ${Hooks.html('admin:row:actions', { canon, item })}
          <div class="vg-rowmenu">
            <button class="vg-rowmenu-btn" aria-haspopup="menu" aria-expanded="false"
              aria-label="Actions for ${esc(name)}" data-id="${esc(item.id)}">⋯</button>
            <div class="vg-user-dropdown vg-rowmenu-pop" role="menu" hidden>
              <button role="menuitem" class="vg-open" data-id="${esc(item.id)}">Open</button>
              <button role="menuitem" class="vg-edit" data-id="${esc(item.id)}"
                ${wr.off} title="${esc(wr.why)}">Edit</button>
              <button role="menuitem" class="vg-del vg-danger" data-id="${esc(item.id)}"
                data-name="${esc(name)}" ${wr.off} title="${esc(wr.why)}">Delete</button>
            </div>
          </div>
        </td>
      </tr>`
    }).join('')

    // vg-table-wrap is a real element, not decoration: border-radius does not
    // clip cell backgrounds on a border-collapse table, and the wrapper is
    // also the horizontal scroll container on a narrow screen.
    this.innerHTML = `
      <div class="vg-entity vg-entity--wide">
        <div class="vg-entity-head">
          <h2>${esc(labelName)}</h2>
          ${wr.off ? '<span class="vg-chip">read-only</span>' : ''}
          ${Hooks.html('admin:list:toolbar', { canon })}
          <button class="vg-primary" id="vg-new" ${wr.off}
            title="${esc(wr.why)}">New ${esc(labelName)}</button>
        </div>
        <div class="vg-table-wrap">
          <table class="vg-table">
            <thead><tr>${fields.map((f) => `<th>${esc(Model.titleize(f))}</th>`).join('')}<th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="${fields.length + 1}" class="vg-muted">No ${esc(labelName)} yet.</td></tr>`}</tbody>
          </table>
        </div>
        <p id="vg-count" class="vg-muted">${items.length} item${1 === items.length ? '' : 's'}</p>
      </div>`

    this.wireRefLinks(this)
    this.querySelector('#vg-new').onclick = () => this.showForm(null)

    // The row is the Open target. Delegated, and it steps aside for anything
    // that is already interactive - the reference links in the cells, and the
    // actions cell itself - so nothing that worked before stops working.
    const tbody = this.querySelector('.vg-table tbody')
    if (tbody) {
      tbody.onclick = (ev) => {
        if (ev.target.closest('.vg-actions, a, button, input, select, details')) return
        const tr = ev.target.closest('[data-row]')
        if (tr) this.navigate(canon, tr.dataset.row)
      }
    }

    for (const pop of this.querySelectorAll('.vg-rowmenu-pop')) {
      // Clicks inside the menu must not reach the document dismisser before
      // the item's own handler runs - that is what made the two-step delete
      // impossible to arm.
      pop.onclick = (ev) => ev.stopPropagation()
    }
    for (const b of this.querySelectorAll('.vg-rowmenu-btn')) {
      b.onclick = (ev) => {
        ev.stopPropagation()
        const open = 'true' === b.getAttribute('aria-expanded')
        closeRowMenus(this)
        if (!open) openRowMenu(b)
      }
    }
    for (const b of this.querySelectorAll('.vg-open')) {
      // Route through the shell so it can update project context.
      b.onclick = () => this.navigate(canon, b.dataset.id)
    }
    for (const b of this.querySelectorAll('.vg-edit')) {
      b.onclick = () => this.showForm(b.dataset.id)
    }
    for (const b of this.querySelectorAll('.vg-del')) {
      b.onclick = async () => {
        // THE TWO-STEP CONFIRM. One click, no undo, on every row is not a
        // thing to ship - and remove: declares no inverse on purpose, because
        // re-creating a deleted row gives it a NEW id and every reference to
        // the old one would still be broken. So the guard is here rather than
        // in the undo stack.
        //
        // Armed in place rather than in a dialog: the row is the context, and
        // a modal asking "are you sure?" about a name you can no longer see is
        // the weakest form of this. Clicking anything else disarms it.
        if ('armed' !== b.dataset.state) {
          // The menu must STAY OPEN, or the confirm button vanishes the
          // moment it appears. `pop.onclick`'s stopPropagation below is what
          // makes that possible - it is the line that made a two-step delete
          // arm-able at all.
          b.dataset.state = 'armed'
          b.textContent = 'Delete — confirm'
          b.classList.add('vg-armed')
          clearTimeout(this._armTimer)
          this._armTimer = setTimeout(() => {
            b.dataset.state = ''
            b.textContent = 'Delete'
            b.classList.remove('vg-armed')
          }, 4000)
          return
        }
        clearTimeout(this._armTimer)

        const res = await Api.remove(canon, b.dataset.id)
        // Report the refusal. This call used to be awaited and thrown away,
        // so a delete that did nothing looked identical to one that worked.
        if (!res || !res.ok) {
          closeRowMenus(this)
          const note = this.querySelector('#vg-count')
          // Name what is holding it. "Cannot delete" with no reason sends an
          // organiser hunting through the whole programme.
          const why = 'in-use' === (res && res.why)
            ? 'Still in use by ' + res.count + ' ' +
              String(res.held_by || '').split('/')[1] + ' row(s).'
            : (res && res.message) || 'Delete failed: ' + ((res && res.why) || 'unknown')
          if (note) note.textContent = why
          return
        }
        this.afterMutation()
        this.showList()
      }
    }
    // Hook: wire up any custom markup injected by admin:row:actions /
    // admin:list:toolbar (the root element + rendered items are provided).
    Hooks.action('admin:list:after', { root: this, canon, items })
  }

  // ---- detail (relationship navigation) ----

  async showDetail(id) {
    const tok = this.begin()
    const canon = this.canon
    const item = await Api.load(canon, id)
    if (!item) {
      this.innerHTML = `<div class="vg-empty">Not found.</div>`
      return
    }
    const maps = await this.refMaps(canon)
    const fields = Model.displayFields(canon)
    const label = item[Model.labelField(canon)] || id

    const rowsHtml = fields.map((f) => `
      <tr><th>${esc(Model.titleize(f))}</th><td>${this.cell(canon, f, item[f], maps, 'detail')}</td></tr>`).join('')

    // Inverse relationships: everything that references THIS entity.
    const children = Model.inverseRefs(canon)
    const childSections = []
    for (const c of children) {
      const kids = await Api.list(c.canon, { [c.field]: id })
      const kmaps = await this.refMaps(c.canon)
      const kfields = Model.displayFields(c.canon).filter((x) => x !== c.field)
      childSections.push(`
        <section class="vg-children" data-canon="${c.canon}" data-parent-field="${c.field}">
          <div class="vg-entity-head">
            <h3>${esc(c.label)}</h3>
            <button class="vg-primary vg-child-new" data-canon="${c.canon}">New ${esc(c.label)}</button>
          </div>
          <div class="vg-table-wrap">
          <table class="vg-table">
            <thead><tr>${kfields.map((f) => `<th>${esc(Model.titleize(f))}</th>`).join('')}<th></th></tr></thead>
            <tbody>${kids.map((k) => `
              <tr>
                ${kfields.map((f) => `<td>${this.cell(c.canon, f, k[f], kmaps, 'child')}</td>`).join('')}
                <td class="vg-actions">
                  <button class="vg-child-open" data-canon="${c.canon}" data-id="${k.id}">Open</button>
                </td>
              </tr>`).join('') || `<tr><td colspan="${kfields.length + 1}" class="vg-muted">None yet.</td></tr>`}
            </tbody>
          </table>
          </div>
        </section>`)
    }

    if (!this.current(tok)) {
      return
    }
    this.innerHTML = `
      <div class="vg-entity vg-entity--wide">
        <div class="vg-entity-head">
          <button class="vg-link" id="vg-back">‹ ${esc(Model.labelOf(canon))}</button>
          <h2>${esc(label)}</h2>
          <button class="vg-edit" id="vg-edit-detail" data-id="${id}">Edit</button>
        </div>
        <table class="vg-detail"><tbody>${rowsHtml}</tbody></table>
        ${childSections.join('')}
      </div>`

    this.wireRefLinks(this)
    this.querySelector('#vg-back').onclick = () => { this.detailId = null; this.showList() }
    this.querySelector('#vg-edit-detail').onclick = () => this.showForm(id)
    for (const b of this.querySelectorAll('.vg-child-open')) {
      b.onclick = () => this.navigate(b.dataset.canon, b.dataset.id)
    }
    for (const b of this.querySelectorAll('.vg-child-new')) {
      b.onclick = () => this.showForm(null, { canon: b.dataset.canon, preset: this.presetFor(b.dataset.canon, canon, id) })
    }
  }

  // Preset the parent reference (and inherited project) when creating a child.
  presetFor(childCanon, parentCanon, parentId) {
    const preset = {}
    for (const r of Model.refsOf(childCanon)) {
      if (r.target === parentCanon) {
        preset[r.field] = parentId
      }
    }
    return preset
  }

  // ---- form ----

  async showForm(id, childCtx) {
    const tok = this.begin()
    const canon = (childCtx && childCtx.canon) || this.canon
    const preset = (childCtx && childCtx.preset) || {}
    const item = id ? (await Api.load(canon, id)) || {} : Object.assign({}, preset)
    const pf = Model.projectRefField(canon)
    // Hook: transform the editable field list.
    const fields = Hooks.filter('admin:form:fields',
      Model.displayFields(canon).filter((f) => f !== pf), { canon, id })

    // Populate reference pickers.
    const refOptions = {}
    for (const r of Model.refsOf(canon)) {
      if (r.field === pf) {
        continue
      }
      const rows = await Api.list(r.target)
      const lf = Model.labelField(r.target)
      refOptions[r.field] = rows.map((row) => ({ id: row.id, label: row[lf] || row.id }))
    }

    const inputs = fields.map((f) => {
      const fdef = Model.fieldsOf(canon)[f] || {}
      const val = item[f]
      let control
      if (fdef.ref) {
        const opts = refOptions[f] || []
        control = `<select name="${f}">
          <option value="">— none —</option>
          ${opts.map((o) => `<option value="${esc(o.id)}"${o.id === val ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>`
      }
      else if ('Boolean' === fdef.kind) {
        control = `<input name="${f}" type="checkbox"${val ? ' checked' : ''} />`
      }
      else if ('Number' === fdef.kind) {
        control = `<input name="${f}" type="number" value="${null == val ? '' : esc(val)}" />`
      }
      else {
        control = `<input name="${f}" type="text" value="${null == val ? '' : esc(val)}" />`
      }
      return `<label>${esc(fdef.label || Model.titleize(f))} ${control}</label>`
    }).join('')

    if (!this.current(tok)) {
      return
    }
    this.innerHTML = `
      <div class="vg-entity">
        <form class="vg-entity-form">
          <h3>${id ? 'Edit' : 'New'} ${esc(Model.labelOf(canon))}</h3>
          ${inputs}
          ${Hooks.html('admin:form:extra', { canon, id, item })}
          <div class="vg-form-actions">
            <button type="submit" class="vg-primary">Save</button>
            <button type="button" class="vg-link" id="vg-cancel">Cancel</button>
          </div>
          <div class="vg-form-err" id="vg-form-err"></div>
        </form>
      </div>`

    Hooks.action('admin:form:after', { root: this, canon, id, item })
    this.querySelector('#vg-cancel').onclick = () => this.reload()
    this.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault()
      const data = Object.assign({}, id ? { id } : {}, preset)
      // Project-scoped entities inherit the current project.
      if (pf && this.projectId) {
        data[pf] = this.projectId
      }
      for (const f of fields) {
        const fdef = Model.fieldsOf(canon)[f] || {}
        const el = ev.target.querySelector(`[name="${f}"]`)
        if ('Boolean' === fdef.kind) {
          data[f] = el.checked
        }
        else if ('' === el.value) {
          continue
        }
        else {
          data[f] = 'Number' === fdef.kind ? Number(el.value) : el.value
        }
      }
      // Hook: transform the payload just before saving.
      const payload = Hooks.filter('admin:save:data', data, { canon, id })
      const res = await Api.save(canon, payload)
      if (!res.ok) {
        this.querySelector('#vg-form-err').textContent = 'Save failed: ' + (res.why || '')
        return
      }
      // Hook: react to a successful save.
      Hooks.action('admin:save:after', { canon, id, item: res.item, res })
      if ('proj/project' === canon) {
        emit('projects-changed', {})
      }
      // Return to wherever we were.
      this.reload()
    }
  }

  afterMutation() {
    if ('proj/project' === this.canon) {
      emit('projects-changed', {})
    }
  }
}


customElements.define('vg-entity-admin', VgEntityAdmin)
