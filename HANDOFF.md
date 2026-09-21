# Handoff — start here

**As of 2026-09-20.** Written to be read cold, by a person or an assistant, with no memory of how
any of this got here. The reasoning lives in `docs/decisions/`; this is the map.

---

## Where the project is

**Stage 1 (§19.3): complete.** Every surface exists at its thinnest: the model, the `cag` service,
validation, the published snapshot, the public read path, the embed, the `.ics`/`.csv` feeds, the
CLI, the MCP tool, and the calendar stub that was the last gap.

**Stage 2 (§19.4): most of the way.** The calendar track is **merged** (PR #17, `087fef4`). The
**editable grid** — the segment intents, undo via each message's declared `inverse`, and live
validation in the header — is open as **PR #18** on branch `grid-intents`.

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

| Not done, in rough order | |
|---|---|

| `provider:google` | Needs OAuth credentials that do not exist yet. Last among the OAuth providers **on purpose** — the machinery it plugs into is already proven by two providers that can be tested offline. |
| Content | The public Astro page; the `go` SDK; a second MCP tool. |
| **A workshop fixture** | No fixture carries `wrk` or outdoor sessions — the real NodeConf EU 2026 edition has neither, and SPEC §2's description of a country-house edition no longer matches the conference. See `docs/decisions/nodeconf-fixture.md`; needs a programme somebody has a copy of. |
| Blocked | The SDK chain — neither `apidef` nor `sdkgen` bootstraps the `.sdk/` scaffold both require. Written up in `sdk/README.md`. |

---

## Read these first

| | |
|---|---|
| `docs/decisions/calendar-ledger.md` | **The most important file in the repo.** The whole calendar design: why the ledger is shaped as it is, the two orderings that are load-bearing, the safety chain's placement, the queue, and everything deliberately *not* built. |
| `docs/decisions/README.md` | Index of the other five records. |
| `DEMO.md` | How to show the thing. Nine minutes, six surfaces, and what to say when asked. |
| `AGENTS.md` | Conventions. |
| `metsitaba/project-specs` | The specs. **Read-only — never open a PR against it.** Spec corrections get written up in `docs/decisions/` here and raised with the maintainer verbally. |

---

## Running it

```bash
cd backend && npm run build && npm test && npm run web    # :50500, seeds itself
cd embed   && npm run build && ./node_modules/.bin/serve -l 50600 .
cd web     && PLAYWRIGHT_CHROMIUM_PATH=/home/jose/.cache/ms-playwright/chromium-1187/chrome-linux/chrome npx playwright test
```

Sign in as `alice@example.com` / `alice-pass-01`. Current green:
**272 backend · 47 e2e · 13 web unit · 7 embed**.

`web/` has a unit runner now — `cd web && npm test` (`node --test test/*.test.mjs`) — because
`buildInverse` is pure and the path resolution, the falsy-value case and the undo stack semantics
are far cheaper to pin there than through a browser.

**WSL2 does not forward localhost on this machine.** Use `http://172.18.117.226:50500/` (the IP
changes when WSL restarts — `hostname -I`), or set `networkingMode=mirrored` in
`C:\Users\José\.wslconfig` and `wsl --shutdown`.

`PLAYWRIGHT_CHROMIUM_PATH` is an opt-in escape hatch: the cached browser build does not match the
npm package's expected revision. Unset in CI.

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

---

## Open, and Jose's to do

- **Merge PR #18** (the editable grid) when reviewed.
- **Disconnect Workers Builds until Stage 4.** The `Workers Builds: conf-agenda` check is red on
  every PR and on `main`, and always has been - it first appears on `a789a5b` (PR #15); PR #14 has
  no checks at all, so the Cloudflare GitHub App was connected between them. It is **not** a
  regression and it does not block a merge: #15 and #16 both merged with it red, and GitHub still
  reports `MERGEABLE`.

  It fails in **0 seconds** with no log and creates no deployment, because there is nothing to
  build: no root `wrangler.toml`, `cloudflare:` is commented out in `model/env.aon`, and
  `gen/env/` holds only `local` and `aws`. The one `wrangler.toml` in the repo is the `cf-spike`
  worker under `docs/decisions/cloudflare-spike/`. Cloudflare deployment is Stage 4 (§19.6); the
  integration was simply connected ahead of the work.

  Fix: **Cloudflare dashboard -> Workers & Pages -> `conf-agenda` -> Settings -> Build ->
  disconnect the Git repository.** Do it there, not in GitHub, so the app stays installed for any
  other voxgig repo. Reconnect at Stage 4, when `docs/decisions/cloudflare-spike.md`'s blockers
  are dealt with - the gateway is not on npm, `cookie` needs pinning to 0.6.0, `@seneca/reload`
  must be off for Workers, and the handler-map problem is unsolved for `@voxgig/build` apps.

  A red check that means nothing on every PR is how a red check that means something gets missed.
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
