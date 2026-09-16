// Project customisations (CREATE-ONCE — never overwritten by regeneration).
// Your entry point for tailoring the generated app WITHOUT editing the
// generated components. Register HTML / filter / action hooks here, and put
// any CSS in ./custom.css (imported below).
//
// See src/hooks.js for the API. Hook points exposed by the components include:
//   shell:topbar:right, shell:sidebar:top, shell:nav:items
//   admin:list:toolbar, admin:list:items, admin:list:columns, admin:row:actions,
//   admin:list:after, admin:form:fields, admin:form:extra, admin:form:after,
//   admin:save:data, admin:save:after
//   public:sections, auth:form:footer, settings:sections

import './custom.css'
import * as Hooks from './hooks.js'


// Examples (uncomment and adapt to your model):
//
// Hooks.addHtml('shell:topbar:right', () => '<span class="vg-badge">Beta</span>')
//
// Hooks.addFilter('admin:list:items', (items, { canon }) =>
//   'my/entity' === canon ? items.slice().reverse() : items)
//
// Hooks.addHtml('admin:row:actions', ({ canon, item }) =>
//   'my/entity' === canon ? `<button data-do="${item.id}">Do</button>` : '')
//
// Hooks.addAction('admin:list:after', ({ root, canon }) => {
//   // wire up any custom markup you injected above
// })


// --- cag/snapshot.agenda_json ----------------------------------------------
//
// A frozen JSON document in a table cell. Rendered raw it is one enormous line
// that stretches the row past the viewport and squeezes every other column to
// nothing - so it is rendered by CONTEXT instead:
//
//   in the LIST   a derived summary ("6 sessions · 12.4 KB"). A list is for
//                 scanning and comparing rows, and a blob helps with neither.
//   on the DETAIL the document itself, pretty-printed, monospace, collapsed
//                 behind a <details>, scroll-capped, with a copy button.
//
// That split is the ordinary answer for blob columns - it is what Django
// admin, Supabase and Directus all settle on - and it needs no library.
//
// The snapshot is server-generated and byte-exact (SPEC 17), so it is never
// offered as an editable textarea: the only safe things to do with it are read
// it and copy it.

function bytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

Hooks.addFilter('admin:cell', (out, { canon, field, value, where }) => {
  if ('cag/snapshot' !== canon || 'agenda_json' !== field) return out
  if (null == value || '' === value) return '<span class="vg-muted">—</span>'

  const raw = String(value)
  const size = bytes(new Blob([raw]).size)

  let doc = null
  try {
    doc = JSON.parse(raw)
  }
  catch (e) {
    // A snapshot that will not parse is a real problem, and saying so beats
    // rendering 12KB of broken text into the page.
    return '<span class="vg-danger">unparseable · ' + size + '</span>'
  }

  const counts = [
    doc.sessions ? doc.sessions.length + ' session' + (1 === doc.sessions.length ? '' : 's') : null,
    doc.rooms ? doc.rooms.length + ' room' + (1 === doc.rooms.length ? '' : 's') : null,
    doc.speakers ? doc.speakers.length + ' speaker' + (1 === doc.speakers.length ? '' : 's') : null,
  ].filter(Boolean)

  if ('detail' !== where) {
    return '<span class="vg-json-summary">' +
      escapeHtml(counts.slice(0, 1).concat(size).join(' · ')) + '</span>'
  }

  return `
    <details class="vg-json">
      <summary>
        <span class="vg-json-summary">${escapeHtml(counts.concat(size).join(' · '))}</span>
        <button type="button" class="vg-json-copy" data-copy>Copy</button>
      </summary>
      <pre><code>${escapeHtml(JSON.stringify(doc, null, 2))}</code></pre>
    </details>`
})

// The copy button. Delegated, because the detail view re-renders wholesale and
// a bound handler would not survive it.
if ('undefined' !== typeof document) {
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-copy]')
    if (!btn) return
    // Inside <summary>: stop the click from toggling the disclosure too.
    ev.preventDefault()
    ev.stopPropagation()
    const pre = btn.closest('.vg-json') && btn.closest('.vg-json').querySelector('pre')
    if (!pre) return
    try {
      await navigator.clipboard.writeText(pre.textContent)
      btn.textContent = 'Copied'
    }
    catch (e) {
      // Clipboard access can be refused (insecure origin, permissions). Say so
      // rather than leaving the button looking like it worked.
      btn.textContent = 'Press ⌘C'
      const r = document.createRange()
      r.selectNodeContents(pre)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    }
    setTimeout(() => { btn.textContent = 'Copy' }, 1600)
  })
}


// --- epoch milliseconds ------------------------------------------------------
//
// Same screen, same complaint: `published_at` renders as 1789545357108, which
// is unreadable and, worse, unsortable by eye. Every time in this model is UTC
// epoch MILLISECONDS (model/ent.aon), so one rule covers the lot.
//
// The full ISO instant goes in `title`, because the local rendering is a
// convenience and the stored value is the fact.
const EPOCH_FIELDS = /(^|_)(at|t_start|t_end|t_c|t_m)$/

Hooks.addFilter('admin:cell', (out, { field, value, fdef }) => {
  if ('Number' !== fdef.kind || !EPOCH_FIELDS.test(field)) return out
  if ('number' !== typeof value || !isFinite(value)) return out
  // Anything below ~2001 in epoch-ms is far more likely to be a count than a
  // date, and silently relabelling a count as 1970 would be a lie.
  if (value < 1e12) return out
  const d = new Date(value)
  const text = d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  return '<span title="' + d.toISOString() + '">' + escapeHtml(text) + '</span>'
})
