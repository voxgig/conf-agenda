## Why

Deployment is the next thing asked for, and SPEC §19.6 makes Stage 4 the first point anything needs
to leave the local monolith. The public agenda is the right first slice: it is the only path with a
hard, measurable budget (§17: TTFB under 200ms from the KV snapshot), and it is the one path that
needs no Seneca inside the Worker, so it skips every blocker the Cloudflare spike recorded.

## What is wrong today

Nothing runs anywhere but this machine. `backend/model/env.aon:14` has `cloudflare: { active: true }`
commented out, `backend/gen/env/` holds only `aws` and `local`, and there is no
`src/env/cloudflare/` at all. The public read path exists only inside the Express runner
(`backend/src/env/web/web.ts:184`), which is a long-lived node process.

The `Workers Builds: conf-agenda` check has been red on every PR since #15 and fails in 0 seconds
with no log, because there is nothing for it to build. A red check that means nothing on every PR
is how a red check that means something gets missed.

## What Changes

- **Enable the `cloudflare` env** in the model, which generates `gen/env/cloudflare/wrangler.toml`
  and a create-once `src/env/cloudflare/worker.ts` stub.
- **Write that Worker**: it serves `/agenda/:org/:slug.:ext` for `json`, `ics` and `csv` from a KV
  namespace, with the cache and CORS headers the Express route already sets.
- **No Seneca in the Worker.** The JSON path is a KV read served verbatim; the feeds run
  `buildIcs` / `buildCsv` from `src/lib/ics.ts`, which is already pure.
- **Unit tests against a KV fake**, including that the Worker's feeds are byte-identical to
  `aim:agenda,get:feed`'s for the same snapshot.
- **A local end-to-end run** under `wrangler dev --local`, and the TTFB figure recorded against
  §17.

## Specs cited

- **SPEC §19.6** (Stage 4: deploy on `@seneca/gateway-cloudflare` + `@seneca/d1-store`, performance budgets asserted).
- **SPEC §17**: TTFB under 200ms for the public agenda page from the KV snapshot, and determinism (every derived file byte-identical for identical input).
- **SPEC §9.1**: `get:agenda` is the one unauthenticated message, published-only, anonymous.
- **SPEC §11.2**: the embed defaults to `/agenda/<org>/<conference>.json`, so the Worker must keep that URL shape.
- **PLATFORM §6**: Cloudflare is the target; the Containers/VM fallback stays the contingency it was written as.

## Decisions

Three forks, resolved by the user on 2026-10-14:

| Fork | Chosen | Why |
|---|---|---|
| What the first Stage 4 change ships | The public read path only | It needs no Seneca in the Worker, so no gateway, no handler map, no D1 and no auth: every recorded blocker is skipped. It is also the only path with a measurable §17 budget, which the ~140ms Seneca construction cost would otherwise eat most of. |
| Deploy target | Local (`wrangler dev --local`) | There is no Cloudflare API token yet. `wrangler` 4.130.0 is already on disk, so nothing is blocked; a real deploy is one command away once a token exists. |
| The red `Workers Builds` check | Leave it until the Worker builds | A check that has always been red and starts passing is a better signal than one reconnected before there is anything to build. |

One decision that follows from the spike rather than a fork: **the Worker contains no Seneca at
all.** The five fixes `docs/decisions/cloudflare-spike.md` lists are about bundling Seneca, and
none of them apply to a bundle that has none.

## Upstream

Nothing blocking. Two things worth telling the platform maintainer, neither needed here:

- The **handler map** (`@voxgig/system`'s `useSrvs()` scans the filesystem, which a Worker cannot) is unsolved for `@voxgig/build`-generated apps generally. It can be generated from the model, which is what the app-path change will do and what the spike feared would have to be hand-maintained.
- `tm/env/cloudflare/wrangler.toml.frag` emits no KV namespace binding, so every project adds one by hand. Worth a slot in the template.

## Capabilities

### New Capabilities
- `public-agenda-edge`: serving the published agenda, its feeds and their cache semantics from an edge Worker backed by a KV snapshot, with no application runtime in the request path.

### Modified Capabilities

None. The Express route keeps its behaviour unchanged; this adds a second surface that must agree
with it byte for byte.

## Impact

| | |
|---|---|
| `backend/model/env.aon` | `cloudflare: { active: true }` uncommented |
| `backend/gen/env/cloudflare/wrangler.toml` | generated, plus a KV namespace binding |
| `backend/src/env/cloudflare/worker.ts` | the Worker, replacing the generated 501 stub |
| `backend/src/lib/ics.ts` | reused unchanged; it has no imports and is already Worker-safe |
| `backend/test/unit/worker-agenda.test.ts` | new |
| `backend/package.json` | `wrangler` pinned in `devDependencies` for the record |
| `HANDOFF.md`, `docs/decisions/` | the borrowed `wrangler` trap, and the TTFB figure |
