## Context

See proposal.md (Why, What is wrong today) for the evidence. The facts the design rests on:

| Fact | Proof |
|---|---|
| `npm test` globs one level and names `api-router` by hand | `backend/package.json:7` |
| A recursive glob already works with this Node | `backend/package.json:8` (`test-some` uses `dist-test/unit/**/*.test.js`); Node is v24.19.0 |
| The six nested suites are create-once generator output | `node_modules/@voxgig/build/dist/env/web/web_gen.js:104-116` lists them; `:191` skips any `dest` that exists unless `spec.force` |
| The model declares three services and no generic surface | `main.srv` keys are `agenda`, `auth`, `cag`; no `main.msg` pattern matches `aim:api`, `on:ent` or `cmd:` |
| The compiled tests read the model at its source path | `test/tsconfig.json` sets `rootDir: .`, `outDir: ../dist-test`, so `dist-test/unit/srv/api/` resolves `../../../../model/model.json` to `backend/model/model.json` |
| A service boot without the HTTP layer already exists | `test/unit/srv-cag-intents.test.ts:40-48`: `basic(seneca)` then `seneca.use(CagSrv)` |
| `seneca.has(pattern)` answers whether an action is registered | `node_modules/seneca/seneca.js:449` |

Nothing goes in the model. Every value here is read at test time from `model.json` or from a
booted seneca.

## Concepts

**Create-once generation.** A generator writes a file only if it is missing, and after that the
file belongs to the project. Here that is `web_gen` in `@voxgig/build`. That is why the dead
suites can be edited and stay edited, and also why they cannot be deleted: a missing file is
written again on the next `npm run model-build`.

**Known-present and known-absent.** A test that checks something is missing also checks that
something which must exist does exist. Otherwise an empty or reshaped model passes the absence
check for free (PLATFORM §10). Each new absence suite here has both halves.

**Registered action versus declared message.** A *declared* message is a pattern in `main.msg`.
A *registered* action is a pattern a running seneca will answer, checked with `seneca.has`. The
model walk in `browser-surface.test.ts` already covers declarations. `proxy.test.ts` adds the
registered half: it boots the real `cag` service and asks the running seneca. That is the
"through the service" rule: wiring you can only see once something is running.

## Goals / Non-Goals

**Goals:** every compiled test file under `dist-test/unit/` runs; the three dead suites turn
into guards against the generic surface coming back; the docs say what the generator really
does.

**Non-Goals:** fixing the REST router that posts an undeclared `aim:api,on:ent` (proposal.md,
Upstream); reviewing the two auth suites against PLATFORM §10's "load the real thing"; touching
the `*.setup.ts` files; any `web/` or `embed/` test runner.

## Decisions

**1. The glob: `dist-test/unit/**/*.test.js`, with nothing else listed** (chosen by José).
The `api-router` entry is dropped because the glob now covers it, and keeping both would only
mislead a reader. Rejected: listing the two auth files by name. That leaves the trap from
`openspec/config.yaml` (apply guidance) live and needs a guard test to compare the list
against the files on disk.

**2. The dead suites become absence tests** (chosen by José). Rejected: a comment-only
tombstone, because it reports 0 tests and the repo's rules say `pass 0` is not a pass.
Rejected: rewriting against named intents, because `srv-cag-intents.test.ts` and
`browser-surface.test.ts` already cover that. Not possible: deleting, because of `web_gen.js:191`.

- `srv/api/api.test.ts` walks the model only. The thing it guards, an `api` service, would show
  up first as a `main.srv` key, and booting the HTTP layer just to show it is missing would cost
  more than it proves. Two tests: known-absent (`api` not in `main.srv`, no `aim:api` pattern)
  and known-present (`cag` in `main.srv`).
- `srv/ent/proxy.test.ts` boots `basic` plus `CagSrv`, the same way `srv-cag-intents.test.ts:40`
  does, and asks `seneca.has`. Two tests: known-absent (`aim:web,on:ent,cmd:list` not registered,
  `ent` not in `main.srv`) and known-present (`aim:web,on:cag,load:tree` registered). It imports
  neither `ent.setup` nor anything under `src/srv/ent/`.
- `env/web/surface.test.ts` keeps its gateway allow-list test exactly as it is and drops the
  other four. This is the assumption recorded in proposal.md. The allow-list test is still valid
  and nothing else covers it; the four dropped tests read `main.msg.aim` as a map, and
  `browser-surface.test.ts` already does that walk over the list.

Each rewritten file begins with a short header comment. It says the file is create-once
`@voxgig/build` output (`web_gen.js`), that it was rewritten because the generic surface was
removed (SPEC §9), and that deleting it brings the generic version back. A later reader then
does not "clean it up" by deleting it.

**3. The docs.** `config.yaml`'s rule "A new test file goes at the top level of its test
directory..." becomes false once the glob is recursive. It is replaced with the rule that is
still true: the generated suites are create-once, so you edit them and never delete them. The
HANDOFF.md trap entry (`:173-183`) is rewritten around the corrected facts, and adds the REST
router finding. `web-env-and-generic-ent.md:31-45` and `editable-grid.md:76-84` lose
"regenerated byte-identically on every model-build" and "one level only", and say create-once.

## Traps touched

- **The model-build false green.** `npm test` runs whatever is in `dist-test`. The gate runs
  `npm run build` first and reads its exit code before trusting a test count.
- **`pass 0` / `fail 0`.** The proof is the exit code plus the total, 378 tests, compared with
  the count before (360). A recursive glob that silently matched nothing would show up as a drop
  to 0, not as a pass.
- **A walk that goes vacuously green.** Handled by the known-present halves.
- **Never await `seneca.ready()` twice.** `proxy.test.ts` boots once per test with one `ready()`,
  copying `srv-cag-intents.test.ts:48`.
- **Stale compiled files.** `tsc --build test` never removes the `.js` for a deleted `.ts`. The
  dropped tests live inside files that stay, so this does not bite here. It does bite the
  scenario's throwaway probe, and that is why the task clears `dist-test/unit/zz/` by hand.
- Not touched: `valid: Skip` / `'Empty'`, the SPA cache, the ledger, Playwright ordering.

## Test strategy

- **Unit, model walk:** `srv/api/api.test.ts`. The model is where an `api` service would first
  appear.
- **Unit, booted service:** `srv/ent/proxy.test.ts`. Only a running seneca can say a pattern
  is not answered.
- **Unit, source read:** `env/web/surface.test.ts` (unchanged test).
- **The run itself:** `cd backend && npm run build && npm test`. It must exit 0 with `# tests 378`.
  The new-subdirectory scenario is shown once by hand with a throwaway failing probe and is not
  committed.

## Bite check

- `api.test.ts` known-absent: add `api: {}` to a copy of `main.srv` inside the test, rebuild,
  and watch it fail. Then revert.
- `proxy.test.ts` known-absent: register a stub `aim:web,on:ent,cmd:list` in the test boot,
  rebuild, and watch it fail. Then revert.
- `proxy.test.ts` known-present: comment out `seneca.use(CagSrv)`, rebuild, and watch it fail.
  Then revert.
- The recursive glob: the `zz/probe.test.ts` failing probe in tasks.md.

## Risks / Trade-offs

- [The auth suites have only been run alone; `node --test` runs files in parallel processes] →
  each file boots its own in-memory seneca and none opens a port (they post messages). The gate
  run with the whole suite is the proof. A failure there is a finding to report, not to hide.
- [A future `@voxgig/build` adds a new nested generated suite that fails] → it now runs and goes
  red on the first build, which is the visible outcome this change wants.
- [`spec.force` on `web_gen` would overwrite the rewritten bodies] → nothing in this repo passes
  it (`grep -rn force backend/model` is empty). The header comment in each file says what to do
  if it happens.
