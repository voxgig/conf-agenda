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
