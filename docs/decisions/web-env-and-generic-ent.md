# The web env, and the generic `ent` service

Enabling the web environment (`web: { active: true }` in `model/env.aon`) generates a large
surface, some of which this project's spec explicitly diverges from. This records what was kept,
what was left inert, and what is still unresolved.

## `voxgig-system add env web` does not run here

It looks for `model.aontu`; this project — like todo-app, and as PLATFORM.md §1.3 mandates — uses
`model.aon`, which is also what `@voxgig/create-system` generates. The CLI's lookup is the odd one
out. Enable the env by editing `model/env.aon` directly.

## The generic `ent` service is generated, and deliberately not declared

`model-build` emits `backend/src/srv/ent/` — including `web_cmd_save.ts`, an open
canon-plus-item browser surface. SPEC §9 and PLATFORM.md §1.2 both forbid it:

> There is no generic `ent` service. todo-app has one; these projects do not.

It is **regenerated on every `model-build`**, so deleting it does not stick. Instead it is simply
**never declared** in `msg.aon` or `srv.aon`, which makes it unreachable — a test
(`test/unit/browser-surface.test.ts`) asserts no `on:ent` and no generic `cmd:save|load|list|remove`
appears anywhere on the browser surface.

**todo-app has already made the same move.** Its `msg.aon` declares per-entity semantic messages
(`aim:proj,save:project`, `aim:todo,save:item`) with per-entity proxies, and notes the entity work
goes "directly through the concern". So the spec is not diverging from todo-app — the *generator*
is behind both. Closing that properly is a `@voxgig/build` change, which PLATFORM.md §1.2 already
anticipates ("that admin-generation change is a `@voxgig/build` delta").

## Generated test suites are excluded from the run

`model-build` also emits `test/unit/srv/{ent,api,auth}` and `test/unit/env/web`, which test the
generated services against the generic-ent architecture. They fail here because those services are
not declared.

`npm test` therefore globs `dist-test/unit/*.test.js` — this project's own suites — rather than
`**`. This is scoping, not silencing: the one genuinely valuable test among them, the `aim:web`
surface test PLATFORM.md §10 names by name, was **rewritten for the surface we actually have** and
runs on every build, including the known-absent assertions.

## Vendored browser bundles

`web/package.json` asks for `@voxgig/seneca-browser-store` and `@voxgig/seneca-browser-debug`.
Neither is published (404, checked 2026-09-13) — that is the package PLATFORM.md §3.1 records as
"exists, unpublished", owned by the repo-manager developer. §19.2 prescribes vendoring todo-app's
working copy, which is what `web/public/` now holds. See `web/public/VENDORED.md`.

## UNRESOLVED: the auth service does not register

**Status: open. The SPA does not boot because of this.**

`auth` is declared in `srv.aon`, its messages and proxies are declared in `msg.aon`, and
`dist/srv/auth/auth-srv.js` exists and `require`s cleanly. But `@voxgig/system`'s `Local` loader
does not register any `aim:auth,*` pattern. A probe (`backend/tool/probe.mjs`) lists what is
actually wired:

```
aim:agenda,get:agenda
aim:cag,load:tree
aim:cag,publish:fixture
aim:cag,validate:fixture
aim:web,load:tree,on:cag
```

`cag` and `agenda` load from the same folder, by the same loader, with structurally identical
`srv.aon` blocks. Reordering the services changes nothing. The gateway allows `aim:web` wholesale,
so the `not-allowed` the browser sees is "no such action", not a permission refusal.

Consequence: `aim:web,on:cag,load:tree` **works** (verified against the running server — it returns
the seeded `tiny` conference), but the SPA cannot get past sign-in, so the grid has not been seen
rendering in a browser.

Next step is to read `@voxgig/system`'s `useSrvs()` to find its actual selection rule.
