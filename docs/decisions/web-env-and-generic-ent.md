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

## RESOLVED: the auth service now registers

**Cause: the auth messages were never in the model.** `srv.aon` declared the service, but the
`msg.aon` edit that was supposed to add its messages silently did not apply, and the script that
made it reported success anyway. `@voxgig/system`'s selection rule explains the rest:

```js
const srvpats = listmsgs(srv.in).map(m => m.props)   // patterns from the service's `in:` block
srvpats.reduce((a, pat) => (a.push(...allpat.list(pat).map(o => o.data)), a), srvmsgs)
```

`srvmsgs` matches the service's `in:` patterns against `main.msg`. A service whose messages are not
declared loads as a plugin, registers **nothing**, and logs no error — so the browser sees
`not-allowed`, which reads like a permission refusal and is actually "no such action". That
misleading symptom is worth knowing: **check `main.msg` before suspecting the gateway.**

`backend/tool/probe.mjs` lists what is actually registered, and is the fastest way to tell the two
apart.

Also removed `aim:web,get:info`: it was declared with no action file, which PLATFORM.md §1.2
forbids ("only declare messages whose files exist").

## The generic entity admin does not work, and that is the real cost

With auth wired, the SPA signs in and the **custom Fixture view renders** — it uses
`aim:web,on:cag,load:tree`, a semantic message of our own.

The other entity screens do not. The generated `web/src/api.js` reaches for
`aim:web,on:ent,cmd:list|load|save|remove`, which this project deliberately does not declare, so
Room, Speaker, Track, Appearance and Snapshot fail.

SPEC §19.3 lists "generic entity admin plus a read-only grid" for Stage 1, so this is a real gap
rather than a deferred nicety. Three ways to close it:

1. **Declare the generic ent surface** — fastest, and forbidden by SPEC §9 / PLATFORM §1.2. It is
   the surface the tenant-from-payload flaw rode in on. No.
2. **Generate per-entity intent messages** (`update:speaker` with exactly the editable fields) —
   what the spec actually wants, and the `@voxgig/build` delta PLATFORM §1.2 anticipates. Does not
   exist yet.
3. **Hand-write per-entity messages** for room/track/speaker/appearance and point the admin at
   them. Real work, and `api.js` is generated, so the patch would need re-applying on every build
   until (2) lands.

Leaning (3) for Stage 1, scoped to read-only list/load, because the organiser needs to *see* rooms
and speakers before Stage 2 makes them editable.
