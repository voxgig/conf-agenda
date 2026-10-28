# Handoff — start here

**As of 2026-10-28.** Written to be read cold, by a person or an assistant, with no memory of how
any of this got here. The reasoning lives in `docs/decisions/`; this is the map.

**The rules are in `openspec/config.yaml` and the work is planned in `openspec/changes/`.** Every
trap below has a one-sentence rule there, so an assistant gets it before it starts rather than
after it has been bitten. This file keeps the evidence; that file keeps the rule. `AGENTS.md`
holds the facts. See `AGENTS.md` for the workflow in one line.

---

## Where the project is

**Stage 1 (§19.3): complete.** Every surface exists at its thinnest: the model, the `cag` service,
validation, the published snapshot, the public read path, the embed, the `.ics`/`.csv` feeds, the
CLI, the MCP tool, and the calendar stub that was the last gap.

**Stage 2 (§19.4): complete and merged.** The calendar track (PR #17, `087fef4`) and the editable
grid (PR #18) are both on `main`. Every §13.1 binding for the grid now exists, all 10 §16.1 errors
and all 14 §16.2 warnings fire, and the journey is drivable end to end through
`window.seneca.post()` with no DOM interaction.

**Stage 4 (§19.6) has started too, ahead of Stage 3 finishing, because deployment was asked for.**
The public read path runs on a Cloudflare Worker: `/agenda/<org>/<slug>.{json,ics,csv}` served from
a KV namespace, no Seneca in the request path. **It is deployed on Jose's account** as
`conf-agenda-own`, at `https://conf-agenda-own.jose-perigolo.workers.dev`, **and on the voxgig
account** as `conf-agenda`, at `https://agenda.voxgig.com`. Both serve the NodeConf EU 2026
snapshot. Measured: a **19.7ms median TTFB** on Jose's and **21.4ms** on `agenda.voxgig.com`,
against §17's 200ms, but about 200 to 234ms on the first request after a deploy, while the Worker
starts cold. Figures and caveats in
`docs/decisions/cloudflare-spike.md`'s 2026-10-28 addendum, steps in
`docs/how-to/deploy-the-worker.md`. Change: `openspec/changes/deploy-public-agenda-worker`.

**The KV is seeded by hand.** Nothing writes a published snapshot into KV yet. Until the KV write
path change lands, `nodeconf` is put there with `wrangler kv key put` (the how-to, step 4).

**Two deploy targets, one per account,** rendered from `backend/model/env.aon` into
`[env.own]` and `[env.voxgig]`, and deployed with `npm run deploy:own` and `npm run deploy` at the
root. A bare `wrangler deploy` is refused by Cloudflare (`agenda-local` is not a real namespace),
on purpose.

| | Jose's own Cloudflare account | The voxgig account (`7bfad364...`) |
|---|---|---|
| Worker | `conf-agenda-own` on `workers.dev` | `conf-agenda` on `agenda.voxgig.com` |
| State | **deployed and seeded** | **deployed and seeded**, since 2026-10-28, by Workers Builds on `main` |
| Cloudflare Access | none | bypassed for `/agenda/` only, since 2026-10-28; the rest of the host keeps SSO |
| Deploys | by hand, `npm run deploy:own` | every push to `main`: the dashboard Deploy command is `npm run deploy` |

How the deploy questions were settled is recorded in `docs/decisions/to-raise-upstream.md` item 8.

**Stage 3 (§19.5) has started.** Ejection (§12) is done in both modes. The rest is unblocked: the rest of the keyboard
model (`/` instant search, bulk selection), embed breadth (all views, `::part()`, server-side
theming, the size budget in CI), `clone:fixture`, agent skills, `llms.txt`, and the calendar
breadth that can be proven offline (CalDAV with its §10.2 presets, the ICS-by-email fallback, RSVP
tracking, the calendar console, C6 to C9). Microsoft and Zoho wait on OAuth with Google.

| Done | |
|---|---|
| The ledger | `sys/calendar_link`, reconciliation, against a recording fake provider |
| The safety chain | cap → redaction → ledger gate, as prior-wraps **above** the provider dispatch |
| The lock (C10) | advisory lock + a durable run row |
| The queue (§10.6) | one job per (segment × account), backoff with jitter, per-segment progress |
| The sync screens | `SyncPlan.dc.html` and `SyncRun.dc.html`, reached with `S` from the grid |
| `provider:ics` | the first **real** provider, with real iTIP invitations |
| The UI | the voxgig design language across app, public page and embed |
| The editable grid | seven named intents, `Shift`-arrows and drag, `n`/`d`/`t`, undo-as-inverse, the header's live error count |
| Live validation | the header count, and `v` for the diagnostics panel — `j`/`k`, `Enter` to jump, and the publish gate stated |
| The admin's writes | per-entity `make`/`update`/`remove` intents, a two-step delete, and a refusal that names what still holds a row |
| Validation | **all 10 §16.1 errors and all 14 §16.2 warnings**, each with a triggering case and a near-miss |
| The `nodeconf` fixture | the real published NodeConf EU 2026 programme — 2 days, 34 sessions, 27 speakers. Not seeded; `tiny` + `demo` still are |
| Bus-drive | the full journey through `window.seneca.post()` with zero DOM interaction (PLATFORM §10), and a guard that fails if the spec ever grows a click |
| The binding registry | one ordered list behind the key handler, the `?` overlay, the footer and the command bar — order is precedence, and the overlay cannot drift |
| `g` chords | `g a` / `g s`, app-wide, in the capture phase so a mistyped chord cannot reach the grid's own bindings |
| The MCP surface | all four §14 tools: `agenda`, `session_find`, `speaker_find`, `validate`. Read-only, and a test asserts **no write tool is registered** |
| `P` and the publish confirmation | `plan:publish` diffs the snapshot publishing would write against the stored one, so the screen states the changes with verbs rather than a count. **Every §13.1 binding for the grid now exists.** |
| Deleting a session | command bar only, confirmed in the toast, and it names `t` as the alternative |
| The second MCP tool | `conf_agenda_session_find`, plus the first tests the MCP surface has ever had |
| Ejection (§12) | `aim:cag,eject:fixture` and `conf-agenda eject`, `snapshot` and `detached`. Detached keeps the hostable `site/` and the editable `backend/` apart, because the fixture holds the drafts the published agenda withholds. The bundle renders from `file://` with every request blocked (`web/e2e/eject-offline.spec.js`, the promise itself), assets are vendored or the eject refuses, and no speaker email reaches any mode. See `docs/decisions/ejection.md` |

| Not done, in rough order | |
|---|---|
| `provider:google` | Needs OAuth credentials that do not exist yet. Last among the OAuth providers **on purpose** — the machinery it plugs into is already proven by two providers that can be tested offline. |
| Content | The public Astro page — **blocked**, see below; the `go` SDK — blocked on the SDK chain. |
| **A workshop fixture** | No fixture carries `wrk` or outdoor sessions — the real NodeConf EU 2026 edition has neither, and SPEC §2's description of a country-house edition no longer matches the conference. See `docs/decisions/nodeconf-fixture.md`; needs a programme somebody has a copy of. |
| Blocked | The SDK chain — neither `apidef` nor `sdkgen` bootstraps the `.sdk/` scaffold both require. Written up in `sdk/README.md`. |

---

## Read these first

| | |
|---|---|
| `docs/decisions/calendar-ledger.md` | **The most important file in the repo.** The whole calendar design: why the ledger is shaped as it is, the two orderings that are load-bearing, the safety chain's placement, the queue, and everything deliberately *not* built. |
| `docs/decisions/README.md` | Index of the other records. |
| `DEMO.md` | How to show the thing. Nine minutes, six surfaces, and what to say when asked. |
| `AGENTS.md` | Conventions. |
| `metsitaba/project-specs` | The specs. **Read-only — never open a PR against it.** Spec corrections get written up in `docs/decisions/` here and raised with the maintainer verbally. |

---

## Running it

```bash
cd backend && npm run build && npm test && npm run web    # :50500, seeds itself
cd embed   && npm run build && ./node_modules/.bin/serve -l 50600 .
cd web     && PLAYWRIGHT_CHROMIUM_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | tail -1) npx playwright test
cd embed   && npm test
```

Sign in as `alice@example.com` / `alice-pass-01`. Current green:
**378 backend · 64 e2e · 24 web unit · 8 embed**.

`web/` has a unit runner now — `cd web && npm test` (`node --test test/*.test.mjs`) — because
`buildInverse` is pure and the path resolution, the falsy-value case and the undo stack semantics
are far cheaper to pin there than through a browser.

**WSL2 does not forward localhost on this machine.** Use `http://172.18.117.226:50500/` (the IP
changes when WSL restarts — `hostname -I`), or set `networkingMode=mirrored` in
`C:\Users\José\.wslconfig` and `wsl --shutdown`.

`PLAYWRIGHT_CHROMIUM_PATH` is an opt-in escape hatch: the cached browser build does not match the
npm package's expected revision. Unset in CI.

**Derive the path, never pin it.** It used to read `chromium-1187/chrome-linux/chrome`, and both
halves went stale: the build number moved to 1228, and Playwright renamed the directory to
`chrome-linux64`. The `ls ... | tail -1` form above survives both. `npx playwright install
chromium` is the proper fix and needs npm, which does not work from here (see the trap below).

---

## Traps that have already cost time

**`valid: 'Empty'` is the other half of the same trap, and it is REQUIRED.** `Skip` lets a field be
absent but rejects `''`; `'Empty'` permits `''` but still requires the key. Both faces are live in
this model — `sys/calendar_job.claim` hit the second one, and so did a test fixture that left
`speaker.email` out.

**`valid: Skip` does not mean optional.** It lets a field be *absent* but still rejects an empty
string — so a form that clears a box cannot save, and any state defined by "this value is missing"
is unstorable. It has bitten five fields (`speaker.email`, `calendar_id`, `secret_ref`, two
`last_error`s), each fixed with `valid: 'Empty'`. **The rest of the model has not been audited.**

**`inverse` in `msg.aon` breaks `model-build`, and it breaks it as a FALSE GREEN.**
`@voxgig/build`'s `MsgMetaShape` is closed and rejects it, but `model.json` is written *before* the
generators run — so the file looks right, the build exits 1, tsc never runs, and `npm test` passes
on the previous `dist-test`. `backend/build/msg_meta.js` withholds it and must stay **first** in
`sys: model: order: action`. Written up in `docs/decisions/editable-grid.md`; the real fix is
`inverse: Skip({})` upstream.

**`npm run model-breaking` exits 1 on an unchanged model.** `aontu breaking` cannot compare
`$.main.ent.cag`'s path-dependent spread template. Verified by stashing every change and re-running.
It cannot gate CI until that is resolved, which the plan assumed it would from the first commit.

**The SPA caches `get:`/`list:`/`load:` messages and invalidates only on a client write.** Anything
whose value changes on the *server* must not be named with one of those verbs, or the first poll is
cached for ever and the screen silently disagrees with the truth. That is why the run poll is
`watch:run`. Any future live view needs the same care.

**`id$` only creates.** Saving an existing id that way is `entity-id-exists`. Updating a row loads
it first.

**Awaiting `seneca.ready()` twice never resolves** — the test hangs rather than failing.

**RFC 5545 folds any line past 75 octets**, so ATTENDEE lines are routinely split. Asserting on the
raw `.ics` tests the folding, not the content.

**`npm` cannot reach the registry from this machine, but `curl` can.** `npm install` of anything
new fails with `ETIMEDOUT` after three attempts, and so does a plain `node` HTTPS request to
`registry.npmjs.org` — while `curl` to the same host returns 200 in ~1.5s, and DNS resolves fine.
So it is node's outbound egress, not the network and not npm's config (it fails with
`--userconfig /dev/null` too). **Everything already in `node_modules` works; nothing new can be
added.** That is what blocks the public Astro page, which needs `astro` installed. There is also an
npm auth token in `~/.npmrc` — unrelated to this, but worth rotating if it is stale.

**`pass 0` is not a pass, and neither is `fail 0`.** The embed suite spent a week reporting
`pass 0, fail 0` because its browser glob matched nothing and the launch threw inside `before()`,
which node's runner counts as *cancelled* rather than failed. Grepping for `fail` saw zero and
looked fine. **Read the `pass` count against the `tests` count, or read the exit code** (it is
correctly 1). The launch now throws with a message naming what is missing.

**A green suite is not a built suite.** `npm run build` is `model-build && tsc`, so a model-build
failure means tsc never runs - and `npm test` then passes against the *previous* `dist-test`. A
false green, and it looks exactly like a real one. After anything that touches `model/`, check
that the build exited 0 before believing the tests. The same trap bites any workflow that edits
source and reruns tests without rebuilding.

**A rule that needs more than the tree can skip SILENTLY.** `bad-color-contrast` needs the theme's
surfaces and the asset rules need a filesystem checker; given neither, both return `[]` — correct
for a pure function, and indistinguishable from "nothing is wrong". `srv-cag-validate.test.ts`
asserts each one fires *through the service*, which is the only place the wiring is visible.

**A cycle is unreachable from the top, so `resolve:tree` never returns one.** `fixture-cycle`
therefore runs over everything that claims this conference via the denormalised `top_id`, not over
the resolved subtree — where it could never have fired at all.

**A test that walks the model must assert a known-present *and* a known-absent case.** The surface
test went vacuously green once already. Two later tests (`grid-keys`, `calendar-sync`) were
confirmed to bite by reintroducing the bug on purpose — worth doing for anything safety-shaped.

**The generated test suites are create-once: edit them, never delete them.** `@voxgig/build`'s
`web_gen` lists six suites under `backend/test/unit/srv/` and `test/unit/env/web/`
(`node_modules/@voxgig/build/dist/env/web/web_gen.js:104-116`) and skips any file that already
exists (`:191`). Delete one and the next `model-build` writes the generic version back. Until
`run-the-nested-test-suites`, `npm test` globbed only the top directory, so five of them never ran and
nor would any new test in a subdirectory. Run by hand there were 30 tests and 13 failed, all on
the generic `ent`/`api` surface SPEC §9 removed. The glob is now `dist-test/unit/**/*.test.js`.
The two `auth` suites run unchanged (13 tests). `srv/api/api` and `srv/ent/proxy` now assert that
the generic surface is **absent**, each with a known-present case. `env/web/surface` keeps only its
gateway allow-list test. 378 tests run, where 360 did.

**The REST router posts a message nothing answers.** `backend/src/env/web/api.ts:90` posts
`aim:api,on:ent`. No `api` service is declared (`main.srv` holds `agenda`, `auth` and `cag`), so a
real REST request finds no action. `env/web/api-router.test.ts` passes 9/9 only because it mocks
that message. Open for José: route REST onto the named intents, or drop the REST layer until it
has a design.

**A documentary dependency pin desynchronises a committed lockfile.** `wrangler` was added to
`backend/package.json` as a record of the intended version, with no way to regenerate
`backend/package-lock.json` (npm cannot reach the registry here). That alone breaks `npm ci`
("package.json and package-lock.json are not in sync") and makes `npm install` in `backend/` try
to fetch it and time out. It is removed; the pin lives in the root `package.json`, where wrangler
is genuinely installed and used by the build. **Never add a dependency you cannot also lock.**

**The `openspec` CLI is borrowed, not installed.** `npm install` cannot reach the registry from
this machine (see the trap above), so `~/.local/bin/openspec` is a **symlink into
`~/cp_rocket/node_modules/.bin/openspec`**, version 1.12.0, pinned for the record in the root
`package.json`. It disappears if cp_rocket is cleaned or reinstalled. The symptom is every
`/opsx:*` command failing with `openspec: not found`; the fix is to recreate the symlink, or to
run `npm install` at the repo root from a machine that can reach the registry.

**`openspec validate --all --strict` does not parse `config.yaml`,** and the failure is quieter
than it looks. An unquoted colon followed by a space does **not** make the file unparseable: YAML
reads that list item as a *map* instead of a string, the rule count stays identical, and the CLI
drops **every rule in that operation** with one line on stderr while `validate` still passes.
Counting the entries is therefore not a check. Assert every entry is a string, and read
`openspec instructions apply --change <id> --json` for the real verdict: it prints
`Guidance for operation 'apply' must be an array of strings, ignoring this operation's guidance`.
Cost a live break on 2026-10-14, caught by that command and nothing else. The older wording below
is kept because the fix is the same: quote the rule.
with only a warning on stderr. Validation still passes. The real check is
`openspec instructions proposal --change <id> --json`, which must come back with a non-empty
`context` and `rules`.

---

## Open, and Jose's to do

- **Workers Builds: DIAGNOSED on 2026-10-16, and the old advice below was wrong twice over.**
  The integration is live and has been all along. It runs on every push, branches included, and it
  is connected from **Richard's** Cloudflare account (`7bfad364890d882de616c187873a3aee`), not
  Jose's (`0eea17179e115954177ae5bd5aa2383e`). Jose is a member of both and can switch accounts in
  the dashboard, but an account-owned API token is bound to the account that created it, so a token
  made in Jose's account gets `Authentication error [code: 10000]` against the Worker. A token for
  it has to be created while switched to Richard's account, or be a User API token covering both.

  **The build log says exactly why it fails**, and it is the two things
  `docs/reference/cloudflare-workers-deployment.md` predicted, both confirmed:

  ```
  Detected the following tools from environment: bun@1.2.15, nodejs@24.18.0
  Installing project dependencies: bun install
  Saved lockfile
  + @fission-ai/openspec@1.12.0
  71 packages installed
  Executing user build command: npm run build
  npm error Missing script: "build"
  Failed: error occurred while running build command
  ```

  `bun` because the root has no `package-lock.json` (§3.3), and `Missing script` because the root
  `package.json` has no `build` script (§3.4). Note that `bun install` **succeeded**: the lockfile
  is a determinism problem, not the failure. The failure is the missing script, and the root
  `package.json` exists at all only because the openspec CLI is pinned there.

  **The dashboard settings, read on 2026-10-16:** Build command `npm run build`, Deploy command
  `npm run build`, Root directory `/`, build token `agenda01`, no build variables.

  **There is a THIRD command the settings page does not show**, and it is what actually fails on a
  branch. Build and Deploy run for the production branch; a **Version command** runs for every
  other branch, and ours is Cloudflare's default `npx wrangler versions upload`
  (`docs/reference/cloudflare-workers-deployment.md` §3.4, §3.5). It runs from the repo root with
  no `--config`, finds no wrangler config there, and dies with `Missing entry-point to Worker
  script`. So a branch build now reads: build **succeeds**, version upload fails. On `main` the
  Deploy command is a copy of the build, so both steps pass.

  Fixing the branch case is the dashboard, not the repo (the deploy change's group 2): blank the Version command, or point
  it at a script that passes `--config`. Do not make a root wrangler config just to satisfy it:
  that would start uploading a version on every branch push, against a KV namespace id that is
  still a placeholder.

  **The repo side is fixed** (root `npm run build` is `wrangler deploy --dry-run` over
  `backend/gen/env/cloudflare/wrangler.toml`). It needs no backend or embed install, because the
  Worker imports only `src/lib/ics.ts` and that has no dependencies: a payoff of keeping Seneca out
  of the Worker that shows up in CI.

  **A green check here means the Worker BUNDLES, not that it deploys.** Cloudflare validates an
  upload by executing it, and `--dry-run` never uploads
  (`docs/reference/cloudflare-workers-deployment.md` §0). An unused import is also elided by
  TypeScript before esbuild sees it, so a dependency that is imported and never used cannot fail
  this check. Verified both ways on 2026-10-16: a used import of a missing module exits 1 with
  `Could not resolve`, an unused one does not.

  **The dashboard's Deploy command is `npm run deploy`** (`wrangler deploy --env voxgig`), since
  2026-10-28, so every push to `main` deploys `conf-agenda` to `agenda.voxgig.com`. It was
  switched only after the voxgig namespace was seeded, so `main` never deployed a Worker with
  nothing to serve.

  **The Worker name must match the dashboard Worker.** The generated config said
  `conf-agenda-backend` while CI expected `conf-agenda`, and Workers Builds overrode it with a
  warning that it "will attempt to open a pull request to resolve this config name mismatch"
  (§3.6). Fixed in `backend/tm/env/cloudflare/wrangler.toml.frag`: the name is `$$name$$`, with no
  suffix.

  One harmless warning stays in the CI log: `Cannot find base config file
  "@tsconfig/node16/tsconfig.json"`, because the root build installs no backend dependencies and
  does not need to. esbuild warns and carries on. Do not chase it.

  Both accounts now serve the Worker (Stage 4, above).

- **Seven things to raise with Richard verbally** — all of them written up, with the evidence, in
  **`docs/decisions/to-raise-upstream.md`**. Read that rather than this line. In short:
  `inverse: Skip({})` in `@voxgig/build` (it breaks `model-build` as a *false green*, and we carry
  `build/msg_meta.js` because of it); the SDK chain's missing `.sdk/` bootstrap (blocks the `go`
  SDK); §3.1's wrong Cloudflare entries **and the duplicate repo pairs, where the empty stubs are
  newer than the real repos**; §6's retired Cloudflare risk; three `.aon`/`.aontu` mismatches, two
  of which disagree with each other; §1.4's `web.allow`/`api.active`, which drive nothing; and
  SPEC §2's `nodeconf` description, which no longer matches the conference.
- **The interface freeze** with the repo-manager developer.
- `senecajs/Calendar#2` (the deliberate-absences note) is open on the upstream plugin.

---

## Two standing constraints

1. **Never write to `metsitaba/project-specs`.** Read it freely.
2. The dev seed **replays a real history** (sync → cancel → add a co-mentor) so the sync screens
   have something to show. Each step is a real product event against the recording fake; the end
   state of the fixture data is unchanged. If that ever looks like fabricated data, it is in
   `backend/src/env/shared/seed.ts` with the reasoning attached.
