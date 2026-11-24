## ADDED Requirements

### Requirement: Each deploy target names its own account and namespace
The generated wrangler config SHALL carry one named environment per Cloudflare account, `own` and
`voxgig`. Each SHALL name its `account_id` and its own `AGENDA` KV namespace id. The top-level
config SHALL name no account and SHALL keep the local `agenda-local` namespace, so
`wrangler dev --local` and the CI dry-run are unchanged. The values SHALL come from the
`cloudflare` env in the model, never from a hand edit of the generated file.

#### Scenario: Both targets are present and complete
- **WHEN** `npm run model-build` regenerates `backend/gen/env/cloudflare/wrangler.toml`
- **THEN** `[env.own]` and `[env.voxgig]` each carry an `account_id` and a `kv_namespaces` entry binding `AGENDA` to the id the model gives that target
- **PROVEN BY** `backend/test/unit/wrangler-config.test.ts`

#### Scenario: The top level names no account
- **WHEN** the same generated file is read outside any `[env.*]` table
- **THEN** it carries no `account_id`, and its `AGENDA` namespace id is `agenda-local`
- **PROVEN BY** `backend/test/unit/wrangler-config.test.ts`, the known-absent half

### Requirement: A deploy that names no target uploads nothing
A deploy SHALL name its target. A `wrangler deploy` with no `--env` SHALL fail at upload rather than
publish a Worker bound to the placeholder namespace, so no snapshot path reaches the public by
accident.

#### Scenario: A bare deploy is refused by Cloudflare
- **WHEN** `wrangler deploy --config backend/gen/env/cloudflare/wrangler.toml` runs with no `--env`, while logged in to Jose's account
- **THEN** it exits non-zero, Cloudflare names the invalid KV namespace, and the account's Workers list is unchanged
- **PROVEN BY** that command, its output quoted in group 1's PR body

#### Scenario: The scripts always name a target
- **WHEN** the root `package.json` scripts that run `wrangler deploy` without `--dry-run` are read
- **THEN** each of them passes `--env own` or `--env voxgig`
- **PROVEN BY** `backend/test/unit/wrangler-config.test.ts`

### Requirement: A deployed Worker serves the published snapshot anonymously
A deployed Worker SHALL serve the snapshot stored under `org_id:slug` to an anonymous request, with
no redirect to a login. It SHALL serve the stored bytes unchanged, and SHALL answer `not-published`
for a key it does not hold. §9.1 makes `get:agenda` the one unauthenticated message, and §11.2 has
the embed reading it from third-party pages.

#### Scenario: The seeded agenda is served byte for byte
- **WHEN** the `nodeconf` snapshot written by `conf-agenda publish --json` is put under `org_nearform:nodeconf-eu-2026`, and `/agenda/org_nearform/nodeconf-eu-2026.json` is fetched with no credentials
- **THEN** the response is 200, its body is identical to the stored string, and `access-control-allow-origin` is `*`
- **PROVEN BY** `node backend/tool/edge-smoke.mjs <base-url> --expect <snapshot.json>`

#### Scenario: The feeds are served from the same snapshot
- **WHEN** the same agenda is fetched as `ics` and as `csv`
- **THEN** each response is 200 with the calendar or CSV content type and `content-disposition: inline`
- **PROVEN BY** `node backend/tool/edge-smoke.mjs <base-url> --expect <snapshot.json>`

#### Scenario: An unpublished conference is refused at the edge
- **WHEN** a slug with no stored snapshot is fetched as `json`
- **THEN** the response is 404 and its reason is `not-published`
- **PROVEN BY** `node backend/tool/edge-smoke.mjs <base-url>`

#### Scenario: No login stands in front of the agenda
- **WHEN** any `/agenda/*` URL on the deployed host is fetched with no cookies and redirects not followed
- **THEN** the response is not a 3xx, and no response comes from a `cloudflareaccess.com` host
- **PROVEN BY** `node backend/tool/edge-smoke.mjs <base-url>`, run against `agenda.voxgig.com` in group 2

### Requirement: The TTFB budget is measured at a deployed URL
The time to first byte for the published agenda SHALL be measured against a deployed Worker, and
its median SHALL be under SPEC §17's 200ms. The figure SHALL be recorded with where and how it was
measured, because a figure measured from one network is not a guarantee for every reader.

#### Scenario: The median is under budget
- **WHEN** `edge-smoke.mjs` requests the seeded agenda as `json` repeatedly, after one warm-up request
- **THEN** it reports the median and maximum TTFB, exits non-zero if the median is 200ms or more, and the figures are recorded in `docs/decisions/cloudflare-spike.md` with the date, the host and where the request came from
- **PROVEN BY** `node backend/tool/edge-smoke.mjs <base-url> --expect <snapshot.json>`
