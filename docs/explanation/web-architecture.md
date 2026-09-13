# Explanation: web app architecture

*Diátaxis: explanation — why the generated app is built this way.*

## One primitive: Seneca messages

The frontend is web components on a browser Seneca bus. Every data flow —
backend CRUD, auth, cross-component events, cache reactivity — is a
pattern-matched message. `aim:*` messages travel transparently to the
backend gateway (the same patterns the backend services answer); local
concerns stay local. One primitive means one debugging story (the
in-window devtools show every flow), one interception point (the store
cache), and no parallel event system to keep consistent.

## Model-driven at runtime

The app fetches `/model.json` and derives its UI from it: the entity
menu, list columns, forms, relationship pickers and drill-down (from
`ref` fields), project scoping. Adding an entity to the model changes the
running UI on reload — no regeneration, no per-entity components, no
merge conflicts. This is what lets the same generated codebase serve an
entity graph of hundreds of entities.

## Access is membership, not ownership

Signed-in users collaborate through projects: membership in a project
grants access to the project's data (any entity carrying a
`ref: 'proj/project'` field is scoped to the selected project). The
generic backend `ent` service enforces this on every message — the
frontend only *reflects* scoping (the project selector), it never
enforces it.

## Generated once, then yours

The SPA is a starting point, not a framework artifact: after generation
the project owns it. Customisation is layered so upgrades stay cheap —
theme tokens (model) → CSS overrides (`custom.css`) → hooks
(`customise.js`) → custom entity views (model-declared) → direct edits
(last resort). Only `views.js` and `theme.css` regenerate, because they
are pure functions of the model.

## No framework, deliberately

Vanilla custom elements + `innerHTML` rendering keep the generated code
dependency-light, readable, and long-lived (no framework version
treadmill in generated projects). The cost — manual re-render discipline —
is contained by two conventions: explicit `reload()` calls after
mutations, and a render token to discard stale async renders (see
`cmp/admin.js`).
