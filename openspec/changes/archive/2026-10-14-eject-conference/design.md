## Context

Ejection is mostly assembly. Everything the bundle contains already exists and is proven:

| Piece | Where | State |
|---|---|---|
| The published snapshot | `cag/snapshot`, keyed `org_id + ':' + slug`, `agenda_json` a frozen string | written by `publish_fixture.ts`, read by `get_agenda.ts` and `get_feed.ts` |
| `.ics` and `.csv` | `buildIcs` / `buildCsv` in `src/lib/ics.ts` | both built FROM `agenda.json`, so a feed cannot contain what the public agenda does not |
| The component | `embed/dist/conf-agenda.umd.cjs` (9.4KB raw) and `conf-agenda.mjs` | CSS already inlined via `?inline`; the 30KB §11.2 budget is enforced by `embed/tool/size-check.mjs` in `npm test` |
| Asset containment | `makeAssetCheck` in `src/lib/assets.ts` | returns `{ local, exists, contained }`, containment judged on the canonical path after `realpathSync`; its header comment already names an ejected bundle as the thing it protects |
| A hermetic CLI | `backend/bin/conf-agenda.mjs` | loads a fixture file into an in-memory store, no server and no network, dispatching `validate`, `publish`, `feed` |

What does not exist: the message, the handler, the bundle writer, the `index.html`, the README, and
the offline test.

## Concepts

**Manifest.** A map of relative path to content, which is what `eject:fixture` returns. The name
for the idea that a bundle is described before it is written. It exists because `src/lib/validate/*`
are pure functions of their input and `src/lib/assets.ts` is the single place that touches the
disk: keeping eject's core a function from a conference to a manifest means the message is
reachable from the API, the SDK, the REPL and a test without any of them needing a writable
directory, and the one piece that writes files is the CLI.

**Vendoring.** Copying a dependency into the artifact that uses it, so the artifact no longer
resolves it at runtime. Here it means every asset the agenda references is fetched or read once,
at eject time, written under `assets/`, and the reference rewritten to a relative path. Vendoring
is what turns §12's guarantee from a claim into a property of the files.

**A `file://` page cannot fetch, which forces one small embed change.** Chromium blocks `fetch()`
from a `file://` origin as well as module scripts, so `<conf-agenda src="./agenda.json">` cannot
work from a file. Today that is the component's only data path:
`embed/src/conf-agenda.js:115-133` resolves `src`, or `org` plus `conference`, and otherwise fails
with `needs an org and conference, or a src`. So the component gains one additive entry point, a
property the host page can set with an agenda it already has, and the ejected `index.html` inlines
the agenda into a script tag and sets it. `agenda.json` is still written as its own file, for
hosting it properly and for whatever reads the feeds; the inline copy is what makes the `file://`
promise true.

**UMD against ESM, which is load-bearing.** A browser refuses to load a module script from a
`file://` URL: module scripts are fetched under CORS, and a `file://` origin is opaque, so
`<script type="module" src="./conf-agenda.mjs">` fails with no network involved at all. A classic
script has no such restriction. §12 says "open `index.html` from a `file://` URL and it works",
so the bundle ships the **UMD** build as `conf-agenda.js` and `index.html` loads it with a plain
`<script>`. Shipping the `.mjs` would pass every unit test and fail the one thing the section
promises.

## Goals / Non-Goals

**Goals:**
- `eject:fixture` on `aim:cag`, both modes, returning a manifest.
- A bundle that renders from `file://` with every outbound request blocked, proven by a test.
- Reuse, not reimplementation: the snapshot, `buildIcs`/`buildCsv`, `makeAssetCheck` and the embed build.

**Non-Goals:**
- **The §14 API route for eject.** §14 wants one, and a route returning a whole bundle (binary assets included) is its own design question: streaming, a zip, or a job plus a download. It lands with the Stage 3 API work, and the message is shaped so that route is additive.
- **An `E` binding in the app.** §13.1 does not list one, and ejection is not a grid operation.
- **The `aws` or Cloudflare runners in detached mode.** Stage 4 owns those.
- **A `--skip-assets` escape hatch.** It would exist only to produce a bundle that breaks the guarantee.

## Decisions

| Decision | Rationale | Alternative rejected |
|---|---|---|
| The message returns a manifest; the CLI writes it | `src/lib/validate/*` is pure and `src/lib/assets.ts` is the one place doing IO; eject keeps that split, and the message stays reachable from every surface | A handler that writes to `--out` directly. It would make the only way to test eject a temp directory, and would make the message unusable from the SDK. |
| `conf-agenda.js` in the bundle is the UMD build | A module script cannot load from `file://`, which is the one thing §12 promises | The `.mjs`, which is the file an `import` would naturally reach for |
| The embed bundle is copied into backend at build time | An installed CLI has no `../embed/dist`, and §14 expects integrators to install it | Resolving `../embed/dist` at runtime (breaks when installed), or fetching from a running backend (breaks the CLI's hermetic property) |
| An asset that cannot be vendored fails the whole eject, naming it | A half-vendored bundle makes requests when opened, which is the thing §12 says it does not do | Leaving the remote URL and stamping the README |
| A conference with no stored snapshot refuses with `not-published` | §12 freezes *the published* agenda, and publishing on the organiser's behalf turns a read into a write | Publish-then-eject, or ejecting the live tree marked draft |
| Detached ships the local runner | It runs on the organiser's own node today, which is what "keep editing without us" means | The `aws` artefacts, never run from this repo |
| Detached separates `site/` (hostable) from `backend/` (the runner and the editable rows), emails blanked (decided 2026-10-14) | The fixture holds the private sessions `agenda.json` withholds (`agenda.ts:77`), so leaving it beside `index.html` makes one `aws s3 sync .` publish them; this repo guards that structurally everywhere else (`asset-escapes-root`) rather than by documentation | A bold README line saying not to host `backend/`, or exporting only published rows, which loses the drafts that detached mode is for |
| Detached ships the compiled runner, the CLI and the live rows as `backend/fixture.json` | `gen/env/local` alone runs nothing, and the runner boots empty; the CLI already validates, publishes and ejects a fixture file, so editing that file is how the organiser keeps going | Shipping only `gen/env/local` (not runnable), or seeding the runner at boot (new code path in `local.ts`) |
| `not-published` reuses `get_feed.ts`'s existing `why` value | Two surfaces refusing the same condition should say the same word | A new error name |
| The embed gains a property for data it is given; `index.html` inlines the agenda and sets it | `fetch()` is blocked from `file://`, so the component's only current data path cannot satisfy §12's first sentence | Serving the bundle over http only, which abandons the `file://` promise; or a `file://`-specific code path inside the component, which puts a deployment detail in a 30KB budget |

## Traps touched

- **The model-build false green.** This change adds a message to `msg.aon`, so every build is read as a pair: exit 0 AND `eject:fixture` present in `model.json`. A model-build failure would leave `npm test` passing on a stale `dist-test`.
- **A rule that skips silently.** `makeAssetCheck` returns `{ local: false }` for anything with a scheme, and a bundle builder that treats "not local" as "nothing to do" would vendor nothing and pass. The asset tests assert a remote URL is *vendored*, and a vendoring failure *refuses*, rather than asserting the absence of an error.
- **Only declare a model message when its action file exists.** `eject_fixture.ts` lands in the same commit as the `msg.aon` entry, or boot fails.
- **`valid: Skip` against `valid: 'Empty'`.** No new entity field here, so this one does not apply. Said deliberately.
- **An e2e test that mutates seeded data breaks a later spec.** The offline test ejects into a temp directory and touches no seeded row, and it is the one spec in the suite that must run with the network blocked, so it gets its own project rather than sharing the default one.
- **`pass 0` is not a pass.** The offline test runs under a route-blocking context; if the setup throws, node and Playwright can both report a suite that ran nothing. The gate reads the test count.

## Test strategy

| Layer | What it proves | Why there |
|---|---|---|
| `backend/test/unit/srv-cag-eject.test.ts` | the manifest's exact key set, the frozen snapshot, the README's guarantee text, `not-published`, the email sweep, asset refusal, containment refusal, detached being a superset | the manifest is data, so every one of these is a cheap assertion over a map, with no filesystem and no browser |
| `backend/test/unit/cli.test.ts` | the CLI writes what the message returned, and the flags parse | the CLI is the only piece that touches the disk |
| `web/e2e/eject-offline.spec.js` | the bundle renders and a session opens with all outbound network blocked | the only layer where the promise is actually observable. SPEC §12: that test *is* the promise |

The email sweep asserts over **every** manifest entry rather than a named list of files, because
C6 asks for structural stripping and a test that names the files it checks goes green the moment a
new file is added.

## Bite check

Each new safety assertion is confirmed to fail before it is trusted:

| Assertion | Reverting what |
|---|---|
| no email anywhere in the bundle | copy the speaker rows into `agenda.json` unstripped; the sweep must name the file and the address |
| an unvendorable asset refuses | swallow the fetch failure and continue; the test must fail on the surviving remote URL |
| containment refusal | drop the `makeAssetCheck` call; the symlink fixture must get copied and the test must catch it |
| `not-published` | fall back to building the snapshot in memory; the test must fail on a bundle existing |
| the offline render | ship `conf-agenda.mjs` as `conf-agenda.js`; the browser must fail to load it from `file://`, which is the whole reason the UMD build was chosen |

## Risks / Trade-offs

- **node's outbound egress is blocked on this machine** (the registry trap in `HANDOFF.md`, and a plain node HTTPS request to `example.com` times out while `curl` succeeds). So the *download* half of vendoring cannot be exercised here against a real remote host. Mitigation: the vendoring step takes its fetcher as an argument, the unit tests drive it with a recording fake (the pattern the calendar providers already use), and a fixture with local-only assets proves the end-to-end path. The real-network case is a known untested edge, recorded rather than pretended.
- **Blocking all outbound network in Playwright** is done with `context.route('**', r => r.abort())` plus a `file://` page, which blocks requests the browser makes but cannot prove the absence of some other channel. Mitigation: the bundle is also asserted, as text, to contain no absolute `http(s)://` reference and no analytics snippet, so the guarantee is checked structurally and behaviourally.
- **The embed change is a public surface change.** The component is on someone else's marketing site, so the new property is additive, keeps `src` working untouched, and is counted against the §11.2 30KB gzipped budget that `embed/tool/size-check.mjs` already enforces in `npm test`. The budget check is part of the group's gate, not an afterthought.
- **The backend build now depends on the embed build.** A clean checkout that builds only `backend/` gets no embed asset. Mitigation: the copy step fails loudly, naming the missing `embed/dist` and the command that produces it, rather than writing a bundle with a missing component.
