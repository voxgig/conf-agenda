# How to customise the web app

*Diátaxis: how-to guide — change the generated app's look and behaviour
without editing generated components.*

Customisations live in two create-once files that survive regeneration:
`web/src/customise.js` (hook registrations) and `web/src/custom.css`
(style overrides).

## Inject or change HTML

```js
// web/src/customise.js
import * as Hooks from './hooks.js'

Hooks.addHtml('shell:topbar:right', () => '<span class="vg-badge">Beta</span>')
Hooks.addHtml('admin:row:actions', ({ canon }) =>
  'todo/item' === canon ? '<button class="vg-star" data-act="star">star</button>' : '')
```

## Transform data

```js
// Sort or filter list rows before render:
Hooks.addFilter('admin:list:items', (items, { canon }) =>
  'todo/item' === canon
    ? items.slice().sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1))
    : items)

// Adjust the save payload:
Hooks.addFilter('admin:save:data', (data) => ({ ...data, source: 'web' }))
```

## Run behaviour at lifecycle moments

```js
Hooks.addAction('admin:list:after', ({ root, canon, items }) => {
  // wire events on injected elements, integrate analytics, etc.
})
```

All hooks are synchronous and failure-isolated (a throwing hook is logged
and skipped). The full list of points is in the
[web app reference](../reference/web-app.md#hook-points).

## Override styles

Generated styles use CSS variables from the theme. Override tokens or add
rules in `web/src/custom.css`:

```css
:root { --vg-primary: #7c3aed; }
.vg-badge { background: gold; color: #333; }
```

For theme-wide changes (all modes, or new modes), change the model
instead — see [Change the theme](change-the-theme.md).

## When hooks aren't enough

- Replace an entity's whole view:
  [Add a custom entity view](add-a-custom-entity-view.md).
- Backend behaviour: override Seneca actions with priors in the backend
  services.
- As a last resort, edit the generated components directly — they are
  create-once and yours; just note that framework updates then need a
  manual merge.
