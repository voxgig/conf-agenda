## Why

The public agenda Worker has only ever run under `wrangler dev --local`, and §19.6 says the numbers
that justify it (TTFB from KV, edge behaviour) can only be measured deployed. This change deploys
first, ahead of the KV write path and ahead of Stage 3, while Richard is engaged on the Cloudflare
side.

## What is wrong today

- **Nothing is deployed.** The root build is `wrangler deploy --dry-run`
  (`package.json`, `scripts.build`), so Workers Builds proves the Worker bundles and uploads nothing.
  HANDOFF.md ("Nothing is deployed today: Invocations, CPU time and Errors are all 0 over 24 hours").
- **The only KV id is a placeholder.** `backend/model/env.aon:20` is
  `kv_id: 'agenda-local'`, rendered into `backend/gen/env/cloudflare/wrangler.toml`. A real deploy
  needs a real namespace id per Cloudflare account, and the config has room for exactly one.
- **The config names no account.** Jose is a member of two accounts (`0eea1717...` and Richard's
  `7bfad364...`, HANDOFF.md "Open, and Jose's to do"), so an unqualified `wrangler deploy` either
  prompts or picks whichever account the token belongs to.
- **Nothing writes a snapshot into KV.** The Worker reads `org_id:slug`
  (`backend/src/env/cloudflare/worker.ts:66`) and answers `404 not-published` when the key is absent
  (`worker.ts:69-74`). Deployed today, it would answer that for every URL.
- **The Worker on `agenda.voxgig.com` is not ours.** On 2026-10-28,
  `curl https://agenda.voxgig.com/agenda/x/y.json` returned `200` with the body `Hello world`, a
  placeholder. The first real deploy replaces it.
- **The §17 TTFB figure is a local one.** 13.3ms median under `wrangler dev --local`
  (`docs/decisions/cloudflare-spike.md`, 2026-10-16 addendum). It does not count the network or the
  edge.

## What Changes

Two task groups, two PRs, the second stacked on the first:

- **Two named deploy targets in the generated wrangler config.** `[env.own]` (Jose's account,
  `workers.dev`) and `[env.voxgig]` (Richard's account, `agenda.voxgig.com`), each carrying its own
  `account_id` and KV namespace id. The values come from `backend/model/env.aon` through the project
  fragment `backend/tm/env/cloudflare/wrangler.toml.frag`. The top level stays the local
  `agenda-local` config, so `wrangler dev --local` and the CI dry-run are unchanged.
- **A deploy names its target.** Root scripts `deploy:own` and `deploy` (voxgig) pass `--env`.
  A bare `wrangler deploy` deploys the top-level config, whose placeholder namespace id is refused
  by Cloudflare at upload, so nothing reaches either account by accident.
- **A hand-seeding runbook, not a write path.** Until the KV write path exists, a snapshot reaches
  KV by `conf-agenda publish --json` on the `nodeconf` fixture, then
  `wrangler kv key put --remote`. It is written down as a how-to, not built as code. `nodeconf` is a
  programme that is already public, so a deployed Worker serves no invented data.
- **A smoke check against a deployed URL.** `backend/tool/edge-smoke.mjs <base-url>` requests the
  seeded agenda and its feeds, an unpublished slug and an off-route path. It asserts status, reason
  and headers, and reports TTFB. The same tool checks both targets.
- **Group 1: deploy to Jose's account.** Needs nobody. Measures the real TTFB and records it against
  §17.
- **Group 2: deploy to the voxgig account.** Nothing blocks it once Jose confirms his role on that
  account (Upstream). Workers Builds deploys on `main` via `npm run deploy`.

The KV write path stays its own change. It is the one piece of the three HANDOFF lists that is ours.

## Specs cited

- **SPEC §19.6** (Stage 4, Deploy and deepen): the deploy itself, and the performance budgets that
  "can only be measured once deployed".
- **SPEC §17**: TTFB under 200ms for the public agenda from the KV snapshot.
- **SPEC §9.1**: `get:agenda` is the one unauthenticated message. This is why Access cannot sit in
  front of `/agenda/*`.
- **SPEC §11.2**: the embed reads `/agenda/<org>/<conference>.json` anonymously from third-party
  pages.
- **PLATFORM §6**: Cloudflare is the target.

## Decisions

Four forks resolved by the user on 2026-10-19, and a fifth on 2026-10-28:

| Fork | Options | Chosen | Why |
|---|---|---|---|
| Which route first | own account first, then voxgig / voxgig first / own account only | **Own first, voxgig as group 2** | Group 1 needs nobody and proves the whole chain for real. `docs/reference/cloudflare-workers-deployment.md` §0 recommends deploying to a throwaway Worker on another account first. The voxgig questions were settled while group 1 was still unbuilt (Upstream). |
| What KV holds before the write path | hand-seed `nodeconf` / deploy empty / pull in a minimal write path | **Hand-seed `nodeconf`** | Tests a real 200 and a real TTFB with no new code. Deploying empty can only test the 404. A write path is a change of its own and would push this behind Stage 3 work. |
| How the config holds two accounts | wrangler `[env.*]` blocks / one `kv_id` swapped by hand | **`[env.*]` blocks** | Both targets live side by side. The own-account Worker stays usable as a scratch target after the move, which is what §0 of the deployment reference asks for. |
| Who deploys the voxgig target | Workers Builds on `main` / laptop with a token | **Workers Builds on `main`** | The integration is already wired up and runs on every push (HANDOFF.md). It needs only the Deploy command changed and the Version command blanked. |
| How `/agenda/*` gets past Cloudflare Access | a Bypass policy on the existing `conf-agenda` Access app / Access turned off for the Worker / a second Access app for the path only | **A second app for `agenda.voxgig.com/agenda/`, Bypass for Everyone** | A policy applies to every destination of its app, so a Bypass on the existing app opens the whole host. Turning Access off opens nothing today, because the Worker answers 404 off `/agenda/*` (`worker.ts:52-55`), but the admin would be public by default once it is served there. The narrower app fails closed: anything added later stays behind login. |

## Upstream

**Nothing blocks the change.** HANDOFF.md listed four questions for Richard, and drafting turned up
two more. On 2026-10-28 they were settled as follows. `docs/decisions/to-raise-upstream.md` records
it in group 1's PR, and Richard is told what was done rather than asked:

1. **A KV namespace id** in the voxgig account (`7bfad364...`). Jose creates it himself (task 2.1).
2. **Cloudflare Access on `agenda.voxgig.com`.** Done by Jose: a separate self-hosted Access app for
   `agenda.voxgig.com/agenda/` with a Bypass policy for Everyone (Decisions, last row). Checked with
   curl on 2026-10-28: `/agenda/x/y.json` and `/agenda/x/y.ics` return `200` with no login, while
   `/` and `/admin` still return `302` to `voxgig01.cloudflareaccess.com`. §9.1 and §11.2 need the
   anonymous read, and the rest of the host keeps SSO.
3. **The dashboard Deploy command** is `npm run build`, so it can never publish. Jose changes it to
   `npm run deploy` after group 2 merges (task 2.5).
4. **The dashboard Version command** is Cloudflare's default `npx wrangler versions upload`, which
   fails on every branch with `Missing entry-point to Worker script`. Jose blanks it (task 2.5).
5. **Custom Domain or route for `agenda.voxgig.com`.** Jose reads it from the Worker's Settings,
   Domains & Routes, and `[env.voxgig]` declares it (task 2.2).
6. **May the product URL serve the hand-seeded NodeConf EU 2026 agenda** (`org_nearform`)? Yes,
   decided by Jose. It is a finished, already-public programme.

Items 1, 3, 4 and 5 assume Jose is Administrator on Richard's account. He read the Builds settings
there on 2026-10-16, which a plain member cannot see (`docs/reference/cloudflare-workers-deployment.md`
§0), but the role itself is not yet confirmed. Task 2.0 confirms it. If it does not hold, those four
go back to Richard and group 2 waits on him.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-agenda-edge`: adds the requirements for deploy targets (each names its own account and
  namespace, and a deploy with no target cannot upload), for anonymous reachability on a deployed
  host, and for the §17 TTFB measured at a deployed URL.

## Impact

- `backend/model/env.aon`: four new scalar keys on `cloudflare`
  (`own_account_id`, `own_kv_id`, `voxgig_account_id`, `voxgig_kv_id`).
- `backend/tm/env/cloudflare/wrangler.toml.frag`: the `[env.own]` and `[env.voxgig]` blocks.
- `backend/gen/env/cloudflare/wrangler.toml`: regenerated, not edited.
- Root `package.json`: `deploy:own` and `deploy` scripts. `build` is unchanged.
- New: `backend/tool/edge-smoke.mjs`, `backend/test/unit/wrangler-config.test.ts`,
  `docs/how-to/deploy-the-worker.md`.
- Docs: `docs/decisions/to-raise-upstream.md`, `docs/decisions/cloudflare-spike.md` (the deployed
  numbers), HANDOFF.md, AGENTS.md (the deploy commands).
- No change to `worker.ts`, to any message, or to the Worker's behaviour.
- **Stays shallow:** KV is filled by hand until the write path change lands (still Stage 4).
  Edge caching (`caches.default` in front of KV) is not added. The cache numbers §19.6 mentions wait
  for the CI performance-budget work, also Stage 4.
