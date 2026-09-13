# Agent guide: conf-agenda web app

The model-driven SPA for conf-agenda: vanilla web components on a browser
Seneca message bus (no framework). Generated once by @voxgig/build EnvWeb;
now developer-owned. Backend guide: ../AGENTS.md. Concept docs:
../docs/ (see reference/web-app.md and explanation/web-architecture.md).

## Commands (run in web/)

```bash
npm install
npm run dev        # vite dev server (backend must be running: npm run web in backend/)
npm run e2e        # playwright e2e (headless; starts its own backend)
```

E2e tests run headless Chromium with workers=1 against a shared backend —
keep new specs independent of execution order but tolerant of shared seed
data.

## Architecture in one paragraph

`main.js` imports theme/css, the bus, all components, `views.js`
(generated index of custom views), and `customise.js` (project hooks).
All data flows are Seneca messages on `bus.js`. **Only `aim:web`
messages leave the browser** - that is the sole namespace the gateway
accepts, and each one is a declared proxy to a real service message;
`cmp:*` and events stay local. The transport pin is `aim:web` too, so a
stray service-message post fails locally instead of travelling. The UI is
model-driven at runtime — `model.js` fetches `/model.json` and derives
the entity menu, forms, and relationship navigation; `api.js` wraps the
`aim:web,on:ent,cmd:*` CRUD proxies and the `aim:web,on:auth,*` proxies.

## Editing rules

- Everything here is create-once EXCEPT `src/views.js` and
  `src/theme.css` — those are REGENERATED from the model
  (`npm run model-build` in backend/); never hand-edit them. Theme tokens
  live in `backend/model/theme.aontu`; per-project overrides in
  `src/custom.css`.
- Prefer customisation over editing generated components: hooks in
  `src/customise.js` (see `src/hooks.js` for points), CSS variables in
  `src/custom.css`, or a custom entity view (`ux:{view:'custom'}` in the
  model). Edit components directly only when those layers can't express
  the change.
- Components re-render by setting `innerHTML`; async renders must guard
  against stale overwrites (see the render-token pattern in
  `cmp/admin.js`: capture a token at method start, bail before writing if
  superseded).
- `bus.sub` has no auto-unsubscribe: long-lived subscriptions in
  components must guard callbacks with `this.isConnected`.
- Escape all user data with the local `esc()` helpers when building HTML.
