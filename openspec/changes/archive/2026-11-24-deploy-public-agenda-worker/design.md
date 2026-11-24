## Context

See proposal.md (Why, What is wrong today). The Worker itself is finished and is not touched here:
`backend/src/env/cloudflare/worker.ts` serves `/agenda/<org>/<slug>.{json,ics,csv}` from the
`AGENDA` binding and imports only `src/lib/ics.ts`. What is missing is everything around it: a
config that can name two accounts, something in KV to serve, a way to prove a deployed URL behaves,
and the voxgig account's settings, which Jose now handles (proposal, Upstream).

How the config is produced matters for every decision below. `@voxgig/build` renders
`tm/env/cloudflare/wrangler.toml.frag` by plain `$$key$$` substitution
(`node_modules/@voxgig/build/dist/env/lambda/generate.js:59-65`). The slots are the project
identity plus **every scalar key** on the env definition; object values are skipped
(`node_modules/@voxgig/build/dist/env/env_gen.js:117-131`). The project already shadows that
fragment (`backend/tm/env/cloudflare/wrangler.toml.frag`) to add the KV binding, fed by
`kv_binding` and `kv_id` in `backend/model/env.aon:20`.

## Concepts

- **Wrangler environment**: a named table, `[env.<name>]`, in one wrangler config that overrides
  the top-level settings when `wrangler` runs with `--env <name>`. Here it is the `own` and
  `voxgig` tables rendered by the project fragment.
- **Inheritable vs non-inheritable keys**: wrangler copies some top-level keys into every
  environment (`main`, `compatibility_date`, `account_id`) and makes you restate others in each one
  (`vars`, `kv_namespaces`). So each `[env.*]` block restates `[vars]` and its KV binding.
- **Hand-seeding**: putting a value into a deployed KV namespace by hand, with
  `wrangler kv key put --remote`, in place of the write path the product will have. Here it is the
  `nodeconf` snapshot that `conf-agenda publish --json` prints (`backend/bin/conf-agenda.mjs:171`).
- **Smoke check**: a short run of real requests against a deployed URL that fails loudly if the
  basics are wrong. Here it is `backend/tool/edge-smoke.mjs`, next to the other probes in
  `backend/tool/` (`probe.mjs`, `mcp-check.mjs`, `repl-check.mjs`).
- **Fail closed at upload**: Cloudflare executes and validates a Worker when it is uploaded, and
  refuses one whose KV binding names a namespace that does not exist in that account. The
  top-level `agenda-local` id relies on that refusal.

## Goals / Non-Goals

**Goals:**

- A deploy to Jose's account that serves the real `nodeconf` agenda, measured.
- A config that can deploy to the voxgig account by changing one model value, once the voxgig
  namespace exists.
- How each of the six voxgig questions was settled, written down with its evidence, and Richard
  told what was done.

**Non-Goals:**

- The KV write path. That is its own change.
- Any change to `worker.ts` or to what it serves.
- Edge caching in front of KV (`caches.default`). The Worker sets `Cache-Control` for browsers
  and downstream caches. Cloudflare does not cache a Worker's own response on the way out. So the
  "edge cache behaviour" §19.6 mentions cannot be measured here, and this change does not claim to.
- Performance budgets asserted in CI. The smoke check is run by hand and its figures are recorded.
  Gating CI on a network figure is later Stage 4 work.

## Decisions

**1. Two `[env.*]` tables, fed by four flat scalar keys.** (User's choice, proposal Decisions.)
`env.aon` gains `own_account_id`, `own_kv_id`, `voxgig_account_id` and `voxgig_kv_id` on the
`cloudflare` entry. The fragment renders two fixed tables from them.

- *Why flat keys, not a nested `targets: { own: {...}, voxgig: {...} }`*: an object value never
  becomes a slot (`env_gen.js:127-131`, the `'object' !== typeof` guard). A nested map would need
  a local generator in `backend/build/`. Four scalars need nothing new.
- *Alternative, one `kv_id` swapped by hand*: rejected by the user. It loses the scratch target
  the moment the voxgig move happens.
- *Account ids in a committed file*: an account id is an identifier, not a credential. Both are
  already written in HANDOFF.md. Tokens stay with `wrangler login`, never in the config
  (config.yaml, cloudflare rules).

**2. Each table states its `name`.** Without it, wrangler deploys `--env voxgig` as
`conf-agenda-voxgig`. That is a different Worker from the dashboard's `conf-agenda`, and the name
mismatch HANDOFF.md already records makes Workers Builds offer a PR to "fix" it
(`docs/reference/cloudflare-workers-deployment.md` §3.6). `[env.voxgig]` sets `name = "$$name$$"`.
`[env.own]` sets `name = "$$name$$-own"`, so the scratch Worker can never be mistaken for the product.

**3. The top level stays local and names no account.** The root `build` script
(`package.json`, `wrangler deploy --dry-run --config ...`) and the `wrangler dev --local` commands
in AGENTS.md read the top level and keep working unchanged. A bare `wrangler deploy` then uploads a
binding to `agenda-local`, which Cloudflare refuses. That refusal is the safety: it is proven by
running it once, not assumed (spec: "A bare deploy is refused by Cloudflare").

**4. Deploys go through named root scripts.** `deploy:own` runs `wrangler deploy --env own --config
backend/gen/env/cloudflare/wrangler.toml`; `deploy` runs the same with `--env voxgig`. `deploy` is
the one the voxgig dashboard calls (user's choice: Workers Builds on `main`). The root has no wrangler
config of its own, on purpose (HANDOFF.md: a root config would make the Version command upload on
every branch).

**5. Hand-seed `nodeconf`, written as a how-to.** (User's choice.) The runbook in
`docs/how-to/deploy-the-worker.md` is: `node backend/bin/conf-agenda.mjs publish
backend/test/fixtures/nodeconf/nodeconf.json --json > <snapshot.json>`, then
`truncate -s -1 <snapshot.json>` to drop the newline `console.log` adds (KV must hold the exact
bytes publishing froze), then
`wrangler kv key put --remote --env own --binding AGENDA --config <C>
"org_nearform:nodeconf-eu-2026" --path <snapshot.json>`. The key is `org_id:slug` from the
fixture's root row (`id: nceu2026, org_id: org_nearform, slug: nodeconf-eu-2026`), the same key
`cag/snapshot` uses. The fixture is not seeded locally (AGENTS.md), so nothing about the local runner
changes.

**6. The smoke check fetches with Node's own `fetch`, nothing installed.** Nothing new can be
installed (config.yaml, tests). It requests the seeded `json`, `ics` and `csv`, an unknown slug and
an off-route path, with `redirect: 'manual'`, so a redirect to Access is seen, not followed. TTFB is
the time until the response headers arrive, measured with `performance.now()` over 20 requests
after one warm-up. It prints the median and the maximum. With `--expect <file>` it compares the
`json` body byte for byte.

**7. The settled questions go in `to-raise-upstream.md` in group 1.** That file is where every
upstream item lives (config.yaml, proposal rules), so it records what was decided, who did it and
the evidence, and Richard is told rather than asked. Group 2's only precondition is task 2.0,
which confirms Jose's role on Richard's account.

## Traps touched

- **The model-build false green** (config.yaml, model): `model.json` is written before the
  generators run, so a fragment that fails to render can still exit 0. Read as a pair: exit 0, and
  `[env.voxgig]` present in the regenerated `wrangler.toml`.
- **Never hand-edit `backend/gen/`**: the env tables are in the fragment and the model, never in
  the generated file.
- **`--dry-run` and `dev --local` do not prove a deploy** (config.yaml, cloudflare): the reason
  this change exists. Group 1's proof is a real deploy and the smoke check, not the dry-run.
- **A token snapshots its permissions at issuance** (config.yaml, cloudflare): after any change to
  Jose's role on either account, run `wrangler logout && wrangler login` before deploying.
- **Account-bound tokens** (HANDOFF.md): a token from Jose's account gets `Authentication error
  [code: 10000]` against Richard's. Group 1 uses `wrangler login`, which issues a user token
  rather than an account-owned one, so the same login reaches Richard's account for group 2's
  namespace and seed (task 2.0 confirms it). Group 2's deploy itself runs in Workers Builds, on the
  build token in Richard's account.
- **Aontu quoting** (config.yaml, model): the account ids are hex and need no quotes, but are
  quoted anyway for consistency with `kv_id`.
- **The Worker name** (deployment reference §3.6): Decision 2.
- **Secrets**: none. Nothing here is a secret, and no `vars` entry is added beyond `NODE_ENV`.
- **Seneca under workerd**: none. The Worker has no Seneca.

## Test strategy

- **The config shape** is a unit test, `backend/test/unit/wrangler-config.test.ts`. It reads the
  generated `wrangler.toml` after model-build, with a small table-aware line reader (no TOML parser
  is installed and none can be). It asserts the known-present half (both env tables, each with
  `account_id`, `name` and an `AGENDA` binding to the model's id) and the known-absent half (no
  top-level `account_id`, top-level id `agenda-local`). It also reads root `package.json` and
  asserts every non-dry-run `wrangler deploy` script passes `--env`. Unit layer, because the shape
  is static text and every later step depends on it.
- **The deployed behaviour** is `backend/tool/edge-smoke.mjs`, run by hand against the real URL.
  It cannot be a unit test: the point is the network, the edge and the upload validation, which
  only a deploy exercises.
- **The Worker's own behaviour** stays proven by `backend/test/unit/worker-agenda.test.ts`,
  unchanged.
- **The bare-deploy refusal** is a one-off command, and its output is quoted in the PR.

## Bite check

- `wrangler-config.test.ts`, known-present half: delete the `[env.voxgig]` table from the fragment,
  run `npm run model-build`, watch the test fail naming `voxgig`, then restore.
- Known-absent half: add `account_id = "$$own_account_id$$"` to the fragment's top level, rebuild,
  watch it fail, then restore.
- Script assertion: remove `--env voxgig` from the root `deploy` script, watch it fail, then restore.
- `edge-smoke.mjs` byte comparison: run it with `--expect` pointing at a file that is not the
  seeded snapshot, and watch it exit non-zero. (`tiny` cannot be that file: its deliberate room
  clash blocks publishing, so it prints an error, not a snapshot.)
- `edge-smoke.mjs` login check: point it at a one-line local `node:http` server that answers
  every request with a 302 to `https://x.cloudflareaccess.com/`, and watch it exit non-zero naming
  the redirect. Then again with a server answering 401 and a `www-authenticate: Cloudflare-Access`
  header, and watch it name Access. Local, so nothing leaves the machine.
- The bare-deploy refusal is itself the bite check for Decision 3.

## Risks / Trade-offs

- [A Workers Builds deploy fires before KV holds anything] → the order in group 2 is: PR merged with
  the real id, seed the voxgig namespace by hand, and only then does Jose switch the Deploy command.
  Until it is switched, `main` still runs the dry-run.
- [`agenda.voxgig.com` declared differently in config and dashboard] → Jose reads the
  declaration from the Worker's Settings, Domains & Routes (task 2.2), and `[env.voxgig]` declares
  what the dashboard shows. Not guessed.
- [TTFB from WSL in one location is not every reader's TTFB] → recorded with the host and where the
  request came from. The spec says the same. Not presented as a global figure.
- [Hand-seeded data goes stale] → `nodeconf` is a finished conference (September 2026), so it does
  not change. The runbook says the seed is temporary and names the write-path change as its end.
- [The scratch Worker stays public on `workers.dev`] → it serves only an already-public programme.
  The runbook includes `wrangler delete --env own` for when it is no longer wanted.

## Migration Plan

Nothing to migrate. Rollback for either target is `wrangler rollback --env <target>` to the
previous version, or `wrangler delete --env own` for the scratch Worker. Removing the hand-seeded key
(`wrangler kv key delete --remote`) returns the Worker to `not-published` without a redeploy.

## Open Questions

None. The six voxgig questions are settled (proposal, Upstream). The only unconfirmed
assumption, Jose's role on Richard's account, is task 2.0 and decides who does group 2's
dashboard steps, not what they are.
