# Handoff — start here

**As of 2026-09-20.** Written to be read cold, by a person or an assistant, with no memory of how
any of this got here. The reasoning lives in `docs/decisions/`; this is the map.

---

## Where the project is

**Stage 1 (§19.3): complete.** Every surface exists at its thinnest: the model, the `cag` service,
validation, the published snapshot, the public read path, the embed, the `.ics`/`.csv` feeds, the
CLI, the MCP tool, and the calendar stub that was the last gap.

**Stage 2 (§19.4): roughly half.** The whole calendar track is built and open as **PR #17**
(6 commits, branch `calendar-ledger`).

| Done | |
|---|---|
| The ledger | `sys/calendar_link`, reconciliation, against a recording fake provider |
| The safety chain | cap → redaction → ledger gate, as prior-wraps **above** the provider dispatch |
| The lock (C10) | advisory lock + a durable run row |
| The queue (§10.6) | one job per (segment × account), backoff with jitter, per-segment progress |
| The sync screens | `SyncPlan.dc.html` and `SyncRun.dc.html`, reached with `S` from the grid |
| `provider:ics` | the first **real** provider, with real iTIP invitations |
| The UI | the voxgig design language across app, public page and embed |

| Not done, in rough order | |
|---|---|
| **The editable grid** | **There are no mutation messages at all yet.** `move:segment`, `set:status`, `add:appearance`; drag and `Shift`-arrows; optimistic updates; undo via each message's declared `inverse`. This is the largest remaining piece, and it is what makes the entity admin's disabled New / Edit / Delete work. |
| `provider:google` | Needs OAuth credentials that do not exist yet. Last among the OAuth providers **on purpose** — the machinery it plugs into is already proven by two providers that can be tested offline. |
| Validation | 4 of 10 error rules and 8 of 14 warnings missing (`fixture-cycle` as a diagnostic, `bad-color-contrast`, `broken-asset`, `asset-escapes-root`). Plus live validation in the app (mockup 3). |
| Content | The `nodeconf` fixture from the real programme; the public Astro page; the `go` SDK; a second MCP tool. |
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

Sign in as `alice@example.com` / `alice-pass-01`. Current green: **176 backend · 22 e2e · 7 embed**.

**WSL2 does not forward localhost on this machine.** Use `http://172.18.117.226:50500/` (the IP
changes when WSL restarts — `hostname -I`), or set `networkingMode=mirrored` in
`C:\Users\José\.wslconfig` and `wsl --shutdown`.

`PLAYWRIGHT_CHROMIUM_PATH` is an opt-in escape hatch: the cached browser build does not match the
npm package's expected revision. Unset in CI.

---

## Traps that have already cost time

**`valid: Skip` does not mean optional.** It lets a field be *absent* but still rejects an empty
string — so a form that clears a box cannot save, and any state defined by "this value is missing"
is unstorable. It has bitten five fields (`speaker.email`, `calendar_id`, `secret_ref`, two
`last_error`s), each fixed with `valid: 'Empty'`. **The rest of the model has not been audited.**

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

**A test that walks the model must assert a known-present *and* a known-absent case.** The surface
test went vacuously green once already. Two later tests (`grid-keys`, `calendar-sync`) were
confirmed to bite by reintroducing the bug on purpose — worth doing for anything safety-shaped.

---

## Open, and Jose's to do

- **Merge PR #17** when reviewed.
- **Five PLATFORM.md corrections to raise with Richard verbally** — §3.1's "does not exist" entries
  for the Cloudflare packages, the retired §6 Cloudflare risk, the `.aon`/`.aontu` extension
  mismatches, §1.4's `web.allow`/`api.active` shape, and the duplicate Cloudflare repo pairs.
- **The interface freeze** with the repo-manager developer.
- `senecajs/Calendar#2` (the deliberate-absences note) is open on the upstream plugin.

---

## Two standing constraints

1. **Never write to `metsitaba/project-specs`.** Read it freely.
2. The dev seed **replays a real history** (sync → cancel → add a co-mentor) so the sync screens
   have something to show. Each step is a real product event against the recording fake; the end
   state of the fixture data is unchanged. If that ever looks like fabricated data, it is in
   `backend/src/env/shared/seed.ts` with the reasoning attached.
