## Why

An organiser must be able to leave and take a working agenda with them. SPEC §12 calls that a
deliberate product promise, not a fallback, and §1 repeats it: the embed is ejectable so the
dependency on us can be dropped entirely. Nothing in the repo implements any of it.

## What is wrong today

`grep -rn '\beject\b' backend/src backend/model web/src embed sdk` returns **nothing**. The
§19.1 feature matrix shows ejection at stub depth from Stage 1, but there is no stub: the
capability is absent. `aim:cag,eject:fixture` is declared in SPEC §9's message table
(`SPEC.CONF-AGENDA.md:479`) and is missing from `backend/model/msg.aon`, and
`backend/bin/conf-agenda.mjs:53` dispatches exactly three commands, `validate`, `publish` and
`feed`.

The promise is currently unkeepable in the plainest sense: an organiser who asked for their
agenda today would get a `curl` of `agenda.json` and no page to put it on.

## What Changes

- **New message `aim:cag,eject:fixture`**, params `{ fixture_id, mode }`, returning the bundle
  as data (a manifest of relative path to content) rather than writing to disk. The rules in
  `src/lib/validate/*` stay pure and `src/lib/assets.ts` does the IO at the edge; eject follows
  the same split, which is also what keeps the message reachable from the API, the SDK and the
  REPL rather than being a CLI-only trick.
- **New CLI command** `conf-agenda eject <conference> --out ./agenda --mode snapshot|detached`,
  which posts that message and writes the manifest to disk.
- **`snapshot` mode** writes the §12 bundle: `index.html`, `conf-agenda.js`, `agenda.json`,
  `agenda.ics`, `agenda.csv`, `assets/`, `README.md` carrying the guarantee, and `LICENSE` (MIT).
- **`detached` mode** writes the same bundle plus the local runner, so an organiser can keep
  editing without us.
- **A backend build step copies the built embed** into a backend asset directory, so an installed
  CLI carries the component.
- **The offline Playwright test**: eject a fixture into a temp directory, serve it with all
  outbound network blocked, drive it, assert the agenda renders and a session opens.

## Specs cited

- **SPEC §12** (the whole section: the bundle, both modes, the guarantee, the offline test).
- **SPEC §9** message table (`:479`), which declares `eject:fixture` on `aim:cag`.
- **SPEC §16.1** `asset-escapes-root`, which names an ejected bundle as the thing the containment
  check protects.
- **SPEC §10.4 C6**: speaker emails never reach the ejected bundle, stripped structurally.
- **SPEC §19.5**, which puts ejection at usable depth in Stage 3.
- **SPEC §14**, which wants an explicit API route for eject. Out of scope here; see Non-Goals in
  the design.

## Decisions

Four forks, all resolved by the user on 2026-10-12:

| Fork | Chosen | Why |
|---|---|---|
| Where `conf-agenda.js` comes from | A backend build step copies `embed/dist` into a backend asset directory | An installed CLI has no `../embed/dist` to resolve, and §14 expects integrators to install it. Fetching it from a running backend would break the CLI's hermetic no-server, no-network property. |
| A remote asset that cannot be downloaded | Fail the whole eject with a named error | The no-network guarantee is the product. A half-vendored bundle silently makes requests when opened, which is exactly the thing §12 promises it does not do. |
| A conference that has never published | Refuse with `not-published` | §12 freezes *the published agenda*. Ejecting an unpublished tree would hand out an agenda that never passed the §16 gate, and publishing on the organiser's behalf would make a read operation a write. |
| What `detached` ships | The local runner | It runs on the organiser's own node today and is what "keep editing without us" means. The `aws` artefacts have never been run from this repo, and shipping an untested path as a product promise is worse than shipping the tested one. |

One decision that follows from existing architecture rather than a fork: **the message returns
data and the CLI writes files.** `src/lib/validate/*` are pure functions and `src/lib/assets.ts`
is the one place that touches the disk; eject keeps that shape.

## Upstream

Nothing. Ejection needs no platform change, no OAuth credential and no new dependency, which is
why it is the first Stage 3 change.

## Capabilities

### New Capabilities
- `conference-ejection`: taking a published conference out of the service as a self-contained
  static bundle, in two modes, with the no-dependency guarantee the bundle's README states.

### Modified Capabilities

None. `openspec/specs/` is empty: this is the first change through the store, so there is nothing
to delta against.

## Impact

| | |
|---|---|
| `backend/model/msg.aon` | `aim:cag,eject:fixture` and its params |
| `backend/src/srv/cag/eject_fixture.ts` | new handler |
| `backend/src/lib/eject/` | new: the bundle builder, the README and `index.html` writers, the asset vendoring |
| `backend/src/lib/assets.ts` | reused unchanged for containment |
| `backend/bin/conf-agenda.mjs` | the `eject` command and its flags |
| `backend/package.json` | the build step that copies the embed bundle |
| `embed/` | unchanged; its `dist` becomes a backend build input |
| `web/e2e/` | the offline bundle test |
| `HANDOFF.md`, `AGENTS.md` | the new command and the new build input |
