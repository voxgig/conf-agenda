## Context

The hard question is already answered. `docs/decisions/cloudflare-spike.md` (2026-09-09) verified
that Seneca 4 runs on Workers, and recorded the cost: 135 to 155ms per request to construct Seneca,
load plugins and reach `ready()`, against 0 to 2ms for message dispatch. It also recorded five
bundling fixes and one unsolved item, `@voxgig/system`'s filesystem-scanning `useSrvs()`.

This change sidesteps all of it, and that is the design. What already exists and is reused:

| Piece | Where | State |
|---|---|---|
| The published snapshot | `cag/snapshot`, keyed `org_id + ':' + slug`, `agenda_json` a frozen string | written by `publish_fixture.ts` |
| The JSON read | `src/srv/agenda/get_agenda.ts` | loads by that key and returns `agenda_json` **verbatim**, explicitly so nothing is composed per request |
| The feeds | `buildIcs` / `buildCsv` in `src/lib/ics.ts` | **231 lines, zero imports, no `node:` builtins, no `Buffer`, no `process`, pure ESM exports.** Worker-safe as written |
| The public route | `src/env/web/web.ts:184-212` | the URL shape, the cache headers, the CORS header, the `inline` disposition, and the 404 shapes |
| The env scaffold | `@voxgig/build` `tm/env/cloudflare/` | `wrangler.toml.frag`, `README.md.frag`, and a `worker.ts.frag` that is a 501 stub whose own comment says it is yours to edit |
| wrangler | `~/cf-spike/node_modules/wrangler` | 4.130.0, on disk, borrowable |

## Concepts

**Edge key-value read.** A lookup in a replicated store placed next to the request, where the value
was computed earlier rather than on demand. Here it is the Workers KV namespace holding the exact
`agenda_json` string `publish:fixture` froze, under the same `org_id:slug` key the entity store
uses. The idea matters because it is what removes the service from the request path: there is
nothing to compose, so there is nothing to boot.

**Per-request service construction, and why it is absent.** On Workers a Seneca instance cannot be
built at module scope (Workers bans timers and randomness in global scope) and cannot be reused
across requests (I/O context restrictions), so the only option is to build one per request and
`close()` it in a `finally`. That is a real pattern, proven in the spike, and it costs ~140ms. The
public read path does not need it, so this Worker does not pay it. The app path later will.

**Byte-for-byte serving.** Returning the stored string rather than `JSON.parse` then
`JSON.stringify`. Not an optimisation: §17 requires every derived file to be byte-identical for
identical input, and the calendar content hash depends on that. A reserialise would reorder nothing
today and might tomorrow, so the guarantee is kept structurally by never doing it.

## Goals / Non-Goals

**Goals:**
- `/agenda/<org>/<slug>.{json,ics,csv}` served from KV by a Worker, with the existing headers.
- One implementation of the feeds, shared with the service path, pinned by a byte-identical test.
- A local end-to-end run and a recorded TTFB figure against §17.

**Non-Goals:**
- **Getting the snapshot into KV.** Publishing writes `cag/snapshot` today; a KV write is a design question of its own (a `sys:provider` writer, `@seneca/kv-store` from `SenecaCloudflareKVStore`, or an explicit push command). This change seeds the local namespace from the CLI and says so.
- **The app and API path**, which needs the gateway, the handler map and auth.
- **D1.** `SenecaCloudflareD1Store` is an unconverted template whose `dist/` still contains OpensearchStore.
- **A real deploy.** No API token yet.
- **Reconnecting `Workers Builds`.** Left red deliberately until the Worker builds.
- **The public Astro page.** Still blocked on `npm install`.

## Decisions

| Decision | Rationale | Alternative rejected |
|---|---|---|
| No Seneca, no gateway, no store in the Worker | The published path composes nothing, so a service boot buys nothing and costs 70% of the §17 budget | Running the real `aim:agenda` messages behind `@seneca/gateway-cloudflare`, which is how the app path will work and is wrong here |
| `json` is served from KV verbatim | §17 determinism, kept by construction | Parse and reserialise, which is how key order drifts |
| The feeds import `src/lib/ics.ts` unchanged | It is already pure and already shared by `get_feed.ts` and the ejected bundle; a second implementation is how two surfaces start disagreeing | A Worker-local copy of the builders |
| Headers are copied from `web.ts:189-209`, not chosen afresh | Moving a conference to the edge must not change how caches and third-party pages treat it | Picking new values, or omitting CORS because the Worker is "just static" |
| `not-published` reuses the existing `why` | Three surfaces now refuse this condition; they should say one word | A new 404 body |
| wrangler is borrowed by symlink, pinned in `package.json` for the record | npm cannot reach the registry from this machine, and the openspec CLI already set this precedent | Vendoring wrangler into the repo, or blocking on an install that cannot happen here |
| The Worker lives at `src/env/cloudflare/worker.ts`, where the generator puts it | `wrangler.toml`'s `main` already points there, and the file is create-once so edits survive a rebuild | A hand-placed entry outside the generated layout |

## Traps touched

- **The model-build false green.** This enables an env, so `model-build` is read as a pair: exit 0 **and** both `gen/env/cloudflare/` and `src/env/cloudflare/` present. A failure after `model.json` is written leaves `npm test` passing on a stale `dist-test`.
- **Create-once generated files.** `src/env/cloudflare/worker.ts` is written once and then skipped, exactly like the `test/unit/srv/` suites: edit it freely, never delete it, because a missing one comes back in its generic 501 form.
- **Never hand-edit `gen/`.** The KV binding has to go in the generated `wrangler.toml`, which is regenerated every build. That is a real conflict and the task list resolves it explicitly rather than discovering it later.
- **A test that walks a module graph can go vacuously green.** The "no Seneca in the bundle" assertion needs a known-present case beside it, or an empty graph satisfies it.
- **`valid: Skip` against `valid: 'Empty'`.** No new entity field here. Said deliberately.

## Test strategy

| Layer | What it proves | Why there |
|---|---|---|
| `backend/test/unit/worker-agenda.test.ts` | the route table, the verbatim body, the feeds matching `get:feed` byte for byte, every header, both 404 shapes, and no service runtime in the graph | the Worker's `fetch` is a plain function of a `Request` and an env object, so a `Map`-backed KV fake tests all of it with no browser and no wrangler |
| `wrangler dev --local` plus `curl` | the bundle actually builds and answers, and the TTFB figure | the only place the bundler and the runtime are exercised; a unit test cannot see a bundling failure |

The byte-identical assertion against `aim:agenda,get:feed` is the one that earns its keep: it is the
only thing stopping the edge and the local runner drifting into two different feeds for one
conference.

## Bite check

| Assertion | Reverting what |
|---|---|
| verbatim JSON body | `JSON.stringify(JSON.parse(value))` instead of the stored string; the byte-identical check must fail |
| feeds match `get:feed` | change one separator in the Worker's call; the comparison must name the difference |
| CORS present | drop the header; the header check must fail |
| 404 `not-published` | return 200 with an empty agenda; the refusal check must fail |
| no service runtime | import `seneca` in the Worker; the graph check must fail, and the known-present half must still pass |

## Risks / Trade-offs

- **The KV binding lives in a generated file.** `gen/env/cloudflare/wrangler.toml` is rewritten by every `model-build`, so a binding added by hand is lost. Mitigation: add it through the model if `env.aon` can carry it, and otherwise keep the binding in a small committed overlay config that `wrangler dev` is pointed at, with the generated file left untouched. The task list settles this by checking what the model actually supports before editing anything.
- **Local KV is not edge KV.** `wrangler dev --local` uses a local simulation, so the TTFB figure is a floor rather than a real-world number, and edge cache behaviour cannot be observed at all. Mitigation: record the figure as local, and leave the deployed measurements to the change that has a token, which is what §19.6 expects anyway.
- **Two surfaces now serve the public agenda.** That is a drift risk by construction. Mitigation: the byte-identical test, plus the fact that both import one feed builder and both read the same frozen string.
- **The snapshot reaches KV by hand for now.** Until the write path exists, an edge deployment can serve a stale agenda with nothing to warn anyone. Mitigation: it is local-only and unpublished, and the write path is named as the next change rather than left implicit.
