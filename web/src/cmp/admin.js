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

  cell(canon, field, value, maps) {
    const fdef = Model.fieldsOf(canon)[field] || {}
    if (fdef.ref) {
      if (null == value) {
        return '<span class="vg-muted">—</span>'
      }
      const m = maps[field] || { labels: {} }
      const label = m.labels[value] || value
      return `<a href="#" class="vg-ref" data-canon="${fdef.ref}" data-id="${esc(value)}">${esc(label)}</a>`
    }
    if ('Boolean' === fdef.kind) {
      return value ? '✓' : '<span class="vg-muted">✗</span>'
    }
    return esc(value)
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

    const rows = items.map((item) => `
      <tr>
        ${fields.map((f) => `<td>${this.cell(canon, f, item[f], maps)}</td>`).join('')}
        <td class="vg-actions">
          ${Hooks.html('admin:row:actions', { canon, item })}
          <button class="vg-open" data-id="${item.id}">Open</button>
          <button class="vg-edit" data-id="${item.id}">Edit</button>
          <button class="vg-del" data-id="${item.id}">Delete</button>
        </td>
      </tr>`).join('')

    this.innerHTML = `
      <div class="vg-entity">
        <div class="vg-entity-head">
          <h2>${esc(labelName)}</h2>
          ${Hooks.html('admin:list:toolbar', { canon })}
          <button class="vg-primary" id="vg-new">New ${esc(labelName)}</button>
        </div>
        <table class="vg-table">
          <thead><tr>${fields.map((f) => `<th>${esc(Model.titleize(f))}</th>`).join('')}<th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="${fields.length + 1}" class="vg-muted">No ${esc(labelName)} yet.</td></tr>`}</tbody>
        </table>
        <p id="vg-count" class="vg-muted">${items.length} item${1 === items.length ? '' : 's'}</p>
      </div>`

    this.wireRefLinks(this)
    this.querySelector('#vg-new').onclick = () => this.showForm(null)
    for (const b of this.querySelectorAll('.vg-open')) {
      // Route through the shell so it can update project context.
      b.onclick = () => this.navigate(canon, b.dataset.id)
    }
    for (const b of this.querySelectorAll('.vg-edit')) {
      b.onclick = () => this.showForm(b.dataset.id)
    }
    for (const b of this.querySelectorAll('.vg-del')) {
      b.onclick = async () => {
        await Api.remove(canon, b.dataset.id)
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
      <tr><th>${esc(Model.titleize(f))}</th><td>${this.cell(canon, f, item[f], maps)}</td></tr>`).join('')

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
          <table class="vg-table">
            <thead><tr>${kfields.map((f) => `<th>${esc(Model.titleize(f))}</th>`).join('')}<th></th></tr></thead>
            <tbody>${kids.map((k) => `
              <tr>
                ${kfields.map((f) => `<td>${this.cell(c.canon, f, k[f], kmaps)}</td>`).join('')}
                <td class="vg-actions">
                  <button class="vg-child-open" data-canon="${c.canon}" data-id="${k.id}">Open</button>
                </td>
              </tr>`).join('') || `<tr><td colspan="${kfields.length + 1}" class="vg-muted">None yet.</td></tr>`}
            </tbody>
          </table>
        </section>`)
    }

    if (!this.current(tok)) {
      return
    }
    this.innerHTML = `
      <div class="vg-entity">
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
