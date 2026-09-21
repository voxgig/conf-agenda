// Client-side model helpers. The compiled model (/model.json) drives the
// entire UI: the entity menu, forms, and — via reference fields
// (kind:String + a `ref` target canon) — the relationship graph. Nothing
// here is entity-specific, so it works for any model.

let _model = null
let _loading = null

const SYS_FIELDS = ['id', 'owner_id', 't_c', 't_m', 't_mh', 't_ch']

async function loadModel() {
  if (_model) {
    return _model
  }
  if (!_loading) {
    _loading = fetch('/model.json').then((r) => r.json()).then((m) => {
      _model = m
      return m
    })
  }
  return _loading
}

function ent() {
  return (_model && _model.main && _model.main.ent) || {}
}

function titleize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ')
}

// Browsable entities (the sys zone is internal — users are only reached via
// reference pickers, never the entity menu).
function entities() {
  const out = []
  const e = ent()
  for (const zone of Object.keys(e)) {
    if ('sys' === zone) {
      continue
    }
    for (const name of Object.keys(e[zone])) {
      // ux:{hide:true} keeps an entity out of the navigation entirely.
      if (e[zone][name] && e[zone][name].ux && e[zone][name].ux.hide) {
        continue
      }
      out.push({
        zone,
        name,
        canon: zone + '/' + name,
        label: titleize(name),
        fields: e[zone][name].field || {},
      })
    }
  }
  return out
}

function fieldsOf(canon) {
  const [z, n] = String(canon).split('/')
  return (ent()[z] && ent()[z][n] && ent()[z][n].field) || {}
}

function labelOf(canon) {
  return titleize(String(canon).split('/')[1] || canon)
}

// Reference fields on an entity: [{ field, target, label }].
function refsOf(canon) {
  const f = fieldsOf(canon)
  return Object.keys(f)
    .filter((k) => f[k] && f[k].ref)
    .map((k) => ({ field: k, target: f[k].ref, label: f[k].label || titleize(k) }))
}

// Entities that reference `canon` (inverse / has-many): [{ canon, field, label }].
function inverseRefs(canon) {
  const out = []
  const e = ent()
  for (const zone of Object.keys(e)) {
    if ('sys' === zone) {
      continue
    }
    for (const name of Object.keys(e[zone])) {
      const fc = zone + '/' + name
      const f = e[zone][name].field || {}
      for (const k of Object.keys(f)) {
        if (f[k] && f[k].ref === canon) {
          out.push({ canon: fc, field: k, label: titleize(name) })
        }
      }
    }
  }
  return out
}

// The reference field pointing at proj/project (project scoping), or null.
function projectRefField(canon) {
  const f = fieldsOf(canon)
  for (const k of Object.keys(f)) {
    if (f[k] && 'proj/project' === f[k].ref) {
      return k
    }
  }
  return null
}

function isProjectScoped(canon) {
  return 'proj/project' === canon || null != projectRefField(canon)
}

// The field to show as an entity's human label (name/title, else first
// plain string field, else id).
function labelField(canon) {
  const f = fieldsOf(canon)
  // An entity may name its own label field: ux: { label: 'slug' }. Without
  // this the fallback below takes the first non-ref String in KEY ORDER, which
  // is alphabetical in model.json - so an entity holding a JSON document in
  // `agenda_json` gets the whole document as its page heading.
  const [z, n] = String(canon).split('/')
  const def = ent()[z] && ent()[z][n]
  if (def && def.ux && def.ux.label && f[def.ux.label]) {
    return def.ux.label
  }
  if (f.name) {
    return 'name'
  }
  if (f.title) {
    return 'title'
  }
  for (const k of Object.keys(f)) {
    if (SYS_FIELDS.indexOf(k) < 0 && !f[k].ref && 'String' === f[k].kind) {
      return k
    }
  }
  return 'id'
}

// Visible (editable/listed) fields: exclude system bookkeeping fields.
function displayFields(canon) {
  const f = fieldsOf(canon)
  return Object.keys(f).filter((k) => SYS_FIELDS.indexOf(k) < 0)
}

// THE MESSAGE LIST (PLATFORM 1.4). main.msg is a LIST of definitions, each
// carrying its pattern as data. The backend serves the whole compiled model at
// /model.json, so the undo contract - each definition's declared `inverse` -
// is readable here without a second request or a second source of truth.
function msgs() {
  return (_model && _model.main && _model.main.msg) || []
}

// 'aim:web,on:cag,move:segment' for a definition.
function patternOf(def) {
  return (def.pat || []).map((p) => Object.keys(p)[0] + ':' + Object.values(p)[0]).join(',')
}

// Every declared pattern - what undo.js checks a proxy against.
function patterns() {
  return msgs().map(patternOf)
}

// The definition behind a pattern, or null. The grid asks for the SERVICE
// pattern (aim:cag,move:segment) rather than the proxy it posts, because the
// inverse contract is declared on the service message.
function msgFor(pattern) {
  return msgs().find((m) => patternOf(m) === pattern) || null
}

// Custom view: an entity may declare ux:{view:'custom'} to replace the
// generic entity admin with a hand-coded component. Returns that component's
// custom-element tag (vg-view-<zone>-<name>) or null for the generic admin.
function customViewTag(canon) {
  const [z, n] = String(canon).split('/')
  const def = ent()[z] && ent()[z][n]
  if (def && def.ux && 'custom' === def.ux.view) {
    return 'vg-view-' + z + '-' + n
  }
  return null
}

export {
  loadModel,
  msgs,
  msgFor,
  patterns,
  patternOf,
  entities,
  fieldsOf,
  refsOf,
  inverseRefs,
  projectRefField,
  isProjectScoped,
  labelField,
  labelOf,
  displayFields,
  customViewTag,
  titleize,
  SYS_FIELDS,
}
