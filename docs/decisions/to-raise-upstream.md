# To raise upstream — the running list

**As of 2026-09-21.** Seven things this project has found that are not this project's to fix.

Two standing constraints shape how they get raised. `metsitaba/project-specs` is **read-only** —
spec corrections are written up here and raised with the maintainer **verbally**, never as a PR
against that repo. And each item below is a thing we have already worked around, so nothing here
is blocking today; the cost is carried code and carried confusion.

Ordered by what it unblocks. Items 1–3 would be expensive to reconstruct.

---

## 1. `inverse: Skip({})` in `@voxgig/build`

**Ask:** add `inverse` to `MsgMetaShape` in `@voxgig/build/src/shape/msg.ts`.

PLATFORM §1.4 mandates `inverse` on a message definition — it is the declared undo contract, and
the browser store's undo log (§5.5) is built from it. But `MsgMetaShape` is a **closed** Gubu shape
over exactly `file, params, doc, out, web, api, transport`, and both `res_yml` and `srv_handler`
apply it to every message in the model. So obeying §1.4 breaks `model-build`:

```
MsgMeta: Validation failed … because the property "inverse" is not allowed.
```

**How it fails is the part to lead with.** Producer order is `msg → model → local`, so
`model_producer` writes `model/model.json` *before* the local generators run. The file on disk
looks correct. The build then exits 1 — and since `npm run build` is `model-build && tsc`, **tsc
never runs**, so `npm test` passes against the previous `dist-test`. A false green over a model
that never compiled. Anyone checking `model.json` sees the `inverse` they wanted and concludes it
worked.

**Our workaround:** `backend/build/msg_meta.js` strips `inverse` from the in-memory model, first in
`sys: model: order: action`. `model.json` keeps it, which is all the SPA needs. **Delete that file
the day this lands** — nothing else in the build reads `inverse`.

### 1a. §1.4's three model-build checks do not exist

`@voxgig/model` 11.0.0 implements duplicate-pattern detection and nothing else. Missing:

- no two definitions resolving to the same action file;
- an `inverse` must carry a `pat`;
- that `pat` must match a declared definition.

And a fourth that matters more than any of them: `msg.aon`'s own rule is "only declare a message
whose action file EXISTS", and nothing enforces it — `@seneca/reload` swallows `MODULE_NOT_FOUND`,
registers a watcher and returns a wrapper, so a declared-but-unimplemented message **boots
cleanly**, passes the whole suite, and throws the first time somebody posts it. In front of an
organiser.

All four are reimplemented in `backend/test/unit/msg-contract.test.ts`. They belong upstream.

---

## 2. The SDK chain cannot be bootstrapped

**Ask:** a bootstrap command, or confirmation that copying todo-app's `.sdk/` shell is the
intended path.

The first link works — `npm run model-build` produces `backend/gen/api/openapi.{json,yaml}`,
OpenAPI 3.1, twelve paths over the five `cag` entities. After that both tools want a `.sdk/`
scaffold **neither of them creates**:

| Command | Wants | Result |
|---|---|---|
| `voxgig-sdkgen target add ts` | `./model/sdk.aon` | `ENOENT` |
| `voxgig-apidef openapi.yaml` | `model/api.aontu` | shape error |

`metsitaba/todo-app` has a working `sdk/.sdk/` — roughly thirty files. The plan in
`sdk/README.md` is to copy its shell, drop our `openapi.yaml` into `.sdk/def/`, run `apidef`, then
`target add ts`. Untried, and worth confirming it is the intended path rather than a hack we
would then carry.

**Blocks the `go` SDK entirely** (SPEC §19.4).

---

## 3. PLATFORM §3.1's Cloudflare entries are wrong, and there are duplicate repos

**Ask:** correct §3.1, and resolve the duplicate pairs so nobody builds this twice.

§3.1 records `@seneca/gateway-cloudflare` and `@seneca/d1-store` as "does not exist — build it".
The real work exists under CamelCase repository names the check missed. **Verified 2026-09-21:**

| Repo | Size | Pushed | State |
|---|---|---|---|
| `senecajs/SenecaCloudflareGateway` | 14KB | 2026-08-14 | **Real, and deployed** (via night-sky-logbook). `@seneca/gateway-cloudflare` v0.0.1, not on npm |
| `senecajs/SenecaCloudflareKVStore` | 23KB | 2026-08-17 | Real source |
| `senecajs/SenecaCloudflareR2Store` | — | 2026-08-17 | Real source |
| `senecajs/SenecaCloudflareD1Store` | 8KB | 2026-06-12 | **Template only** — `dist/` still contains OpensearchStore |
| `senecajs/SenecaCloudflareDOStore` | — | 2026-08-17 | Template only, same |
| `senecajs/seneca-gateway-cloudflare` | **1KB** | 2026-08-31 | Empty stub — LICENSE + README |
| `senecajs/seneca-d1-store` | **1KB** | 2026-08-31 | Empty stub — LICENSE + README |

**The confusing part is that the empty stubs are NEWER than the real repos** — created 31 August,
after the real work landed in mid-August. PLATFORM names the 1KB ones.

So: **do not rebuild the gateway.** Contribute to it — it needs a `wrangler.toml`, a workerd
integration test, and a README fix, because its Quick Example shows the module-scope pattern that
cannot work, which is what sent our spike down the wrong path for a day. **D1 is still genuinely
greenfield**, and it is repo-manager's only dependency at their Stage 4.

Two build notes from vendoring the gateway source, worth checking rather than treating as defects:
`import Cookie from 'cookie'` fails to bundle against `cookie` v1+/v2 (ESM, named exports, no
default) — pinning `cookie@0.6.0` fixes it; and `module.exports =` alongside ESM `export` in one
file makes esbuild flag the mixed module form.

---

## 4. PLATFORM §6's Cloudflare risk is retired

**Ask:** rewrite §6.

§6 says "Seneca on Workers is unproven" and lists three concrete gaps. Our spike (2026-09-09,
`cloudflare-spike.md`) verified that Seneca 4 **does** run on Workers — a positive verdict that
reversed an earlier, wrong one of our own.

The pattern is construct-per-request with `close()` in a `finally`. **`close()` is load-bearing:**
Seneca's `GateExecutor` starts a `setInterval` that only clears once its work queue empties, and an
instance discarded without closing leaves that interval behind and **hangs the next `Seneca()`
construction in the same warm isolate** — the constructor call never returns.

Of §6's three gaps: gap 1 (no gateway adapter) is false, gap 3 (unproven) is retired, gap 2 (no
entity store) is half-true — KV and R2 are real, D1 is a template. Budget **~140ms per request**
for Seneca construction on the app/API path; the public agenda path is served from a KV snapshot
and does not pay it.

**Talk to the night-sky-logbook author before anyone starts.** They have solved every one of these
already, and the handler-map problem is unsolved for `@voxgig/build`-generated apps *generally* —
a shared platform concern rather than a conf-agenda one.

---

## 5. Three extension mismatches, and two tools disagree with each other

**Ask:** pick `.aon` and make the tools agree.

1. `voxgig-system add env web` looks for `model.aontu`; `@voxgig/create-system` writes `model.aon`,
   which is what PLATFORM §1.3 mandates and todo-app uses.
2. `voxgig-sdkgen target add ts` wants `model/sdk.aon`.
3. `voxgig-apidef` wants `model/api.aontu`.

sdkgen and apidef disagree with **each other**, which is the one that cannot be explained as a
stale CLI.

---

## 6. PLATFORM §1.4's `web.allow` / `api.active` do not drive anything

**Ask:** correct §1.4, or make it true.

§1.4 states that "`web.allow` and `api.active` are what the gateway allow-list and REST exposure
are generated from". In this project neither is:

- the gateway allow-list lives in `model/srv.aon` as `aim: web: on: cag: '$': allow: true`;
- REST exposure is configured per **entity** in `model/api.aon`, not per message.

Our `msg.aon` carries no element spread at all, so the fields §1.4 describes are neither present
nor consulted. See `editable-grid.md` for why the spread was deliberately not adopted.

---

## 7. SPEC §2's `nodeconf` description no longer matches the conference

**Ask:** name the edition §2 means, or supply an older published programme.

§2 asks the realistic fixture to exercise "a handful of rooms, so the grid is dense", workshops,
and "the social and outdoor sessions that a conference-in-a-country-house schedules". **NodeConf EU
2026 is none of those** — single-track, one room, a Bologna hotel, no workshops. That description
fits the Kilkenny / Waterford Castle editions.

The fixture was built from 2026 because §2 names *real* as the overriding requirement ("do not
approximate it from memory"). The cost is concrete: **no fixture carries `wrk` or outdoor
sessions.** Getting an older programme was tried and failed — the site's 2024 agenda pages 404,
the Wayback snapshot is a Wix page that renders client-side, the archive.org API rate-limited, and
no public repo carries the schedule. Somebody needs a copy.

Full write-up in `nodeconf-fixture.md`.
