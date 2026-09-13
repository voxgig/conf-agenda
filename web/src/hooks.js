// Frontend customisation hooks. The backend lets you override ACTIONS with
// Seneca message priors; this is the analogue for the generated components —
// hooks for HTML, JS behaviour, and (via CSS variables + custom.css) styling.
//
// Register hooks from customise.js (a create-once file, so your changes are
// never overwritten). Every generated component exposes named hook points; a
// point is `<component>:<region>` (e.g. 'admin:row:actions', 'shell:topbar:right').
//
// Three kinds of hook:
//   addHtml(point, ctx => 'markup')          inject/append HTML at a region
//   addFilter(point, (value, ctx) => value)  transform a value (items, fields, actions)
//   addAction(point, ctx => {...})           run side effects at a lifecycle point
//
// Components call html()/filter()/action() at their hook points. All are
// synchronous and failure-isolated (a throwing hook can't break a render).

const _html = {}
const _filter = {}
const _action = {}

function addHtml(point, fn) {
  (_html[point] = _html[point] || []).push(fn)
}

function addFilter(point, fn) {
  (_filter[point] = _filter[point] || []).push(fn)
}

function addAction(point, fn) {
  (_action[point] = _action[point] || []).push(fn)
}

// Concatenate the HTML contributed by every hook at `point`.
function html(point, ctx) {
  return (_html[point] || []).map((fn) => {
    try {
      return fn(ctx) || ''
    }
    catch (e) {
      console.error('hook html failed:', point, e)
      return ''
    }
  }).join('')
}

// Run `value` through every filter at `point`, in registration order.
function filter(point, value, ctx) {
  return (_filter[point] || []).reduce((v, fn) => {
    try {
      return fn(v, ctx)
    }
    catch (e) {
      console.error('hook filter failed:', point, e)
      return v
    }
  }, value)
}

// Fire every action hook at `point` (side effects only).
function action(point, ctx) {
  for (const fn of (_action[point] || [])) {
    try {
      fn(ctx)
    }
    catch (e) {
      console.error('hook action failed:', point, e)
    }
  }
}

export {
  addHtml,
  addFilter,
  addAction,
  html,
  filter,
  action,
}
