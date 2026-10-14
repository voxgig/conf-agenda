## Purpose

Taking a published conference out of the service as a self-contained static bundle an organiser
can host themselves, in a snapshot mode that only displays and a detached mode that also keeps
editing, with no runtime dependency on any conf-agenda service.

## ADDED Requirements

### Requirement: Eject is a named intent on the cag surface
The system SHALL expose ejection as `aim:cag,eject:fixture` with a closed params shape of
`fixture_id` and `mode`, returning the bundle as a manifest of relative path to content rather
than writing to the filesystem. Every other surface (the CLI, the REPL, the SDK) SHALL reach
ejection by posting that message and SHALL NOT reimplement any part of the bundle.

#### Scenario: The CLI posts the message
- **WHEN** `conf-agenda eject <conference> --out ./agenda` runs
- **THEN** it posts `aim:cag,eject:fixture` and writes the returned manifest to `--out`
- **PROVEN BY** `backend/test/unit/cli.test.ts`, asserting the files on disk match the manifest the message returned

#### Scenario: An unknown mode is refused
- **WHEN** `eject:fixture` is posted with a `mode` that is neither `snapshot` nor `detached`
- **THEN** it refuses, naming the mode, and writes no manifest entry
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`

### Requirement: A snapshot bundle is complete and self-contained
The system SHALL write, for `mode: snapshot`, exactly the §12 bundle: `index.html`,
`conf-agenda.js` with its CSS inlined, `agenda.json`, `agenda.ics`, `agenda.csv`, `assets/`,
`README.md` and `LICENSE`. `agenda.json` SHALL be the stored published snapshot, frozen at eject
time, and SHALL NOT be recomputed from the live tree.

#### Scenario: Every named file is present
- **WHEN** a published fixture is ejected in snapshot mode
- **THEN** the manifest contains each of the eight entries §12 names, and no other top-level entry
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`, asserting the manifest's key set exactly

#### Scenario: The bundle carries the stored snapshot, not a fresh build
- **WHEN** a conference is published, then a session is moved without republishing, then ejected
- **THEN** `agenda.json` shows the session at its published time, not its edited time
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`

#### Scenario: The README states the guarantee
- **WHEN** a bundle is written
- **THEN** its `README.md` states that the bundle has no runtime dependency on any conf-agenda service, contains no tracking of any kind, and is MIT licensed, and explains how to host it, how to refresh it and what it does not do
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`

### Requirement: An ejected bundle makes no network request
The system SHALL vendor every asset the bundle references into `assets/` and rewrite the
referencing paths to be relative. The bundle SHALL contain no analytics, no telemetry, no
phone-home and no absolute reference to any conf-agenda service.

#### Scenario: It renders with all outbound network blocked
- **WHEN** a bundle is served from a temp directory with all outbound network blocked and driven in a browser
- **THEN** the agenda renders and a session opens
- **PROVEN BY** `web/e2e/eject-offline.spec.js`, which is the promise itself: if it is deleted the promise is gone

#### Scenario: An asset that cannot be vendored fails the eject
- **WHEN** an asset the agenda references cannot be downloaded or read
- **THEN** the eject refuses, naming the asset, and writes nothing
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`, with a fixture carrying an unreachable asset

#### Scenario: An asset resolving outside the assets root is refused
- **WHEN** an asset path resolves outside the assets root, including through a symlink inside it
- **THEN** the eject refuses and the file is not copied into the bundle
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`, reusing `makeAssetCheck` from `src/lib/assets.ts`

### Requirement: Ejection carries no private data
The system SHALL NOT include a speaker email address anywhere in an ejected bundle, in any mode,
and SHALL strip it structurally rather than by selecting fields to copy.

#### Scenario: No email survives anywhere in the bundle
- **WHEN** a fixture whose speakers all have email addresses is ejected
- **THEN** no bundle entry contains any of those addresses, including `agenda.json`, `agenda.ics`, `agenda.csv` and the vendored assets
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`, asserting over every manifest entry rather than a named subset

### Requirement: An unpublished conference cannot be ejected
The system SHALL refuse to eject a conference that has never published, naming the condition, and
SHALL NOT publish on the organiser's behalf.

#### Scenario: Never published
- **WHEN** a conference with no stored snapshot is ejected
- **THEN** it refuses with `not-published` and the conference's stored state is unchanged
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`

### Requirement: The embed accepts an agenda it is given
The component SHALL accept a published agenda from its host page as well as fetching one from a
`src` URL, so a page opened from a `file://` origin (where `fetch` is blocked) can render. The
existing `src`, `org` and `conference` attributes SHALL keep working unchanged.

#### Scenario: A host page supplies the agenda
- **WHEN** a page sets the agenda on a `<conf-agenda>` element instead of giving it a `src`
- **THEN** the component renders that agenda and makes no network request
- **PROVEN BY** `embed/test/render.test.mjs`

#### Scenario: The component stays inside its size budget
- **WHEN** the embed is built
- **THEN** both builds are under 30KB gzipped
- **PROVEN BY** `embed/tool/size-check.mjs`, run by `embed` `npm test`

### Requirement: Detached mode adds a runnable backend
The system SHALL write, for `mode: detached`, the snapshot bundle under a `site/` directory plus
the artefacts needed to run the organiser's own instance, and its `README.md` SHALL say which
runtime those artefacts target and what the organiser must supply.

#### Scenario: The detached bundle is a superset
- **WHEN** a fixture is ejected in detached mode
- **THEN** the manifest contains every snapshot entry under `site/`, byte for byte, plus the runner artefacts, and the README names the runtime
- **PROVEN BY** `backend/test/unit/srv-cag-eject.test.ts`

#### Scenario: The editable programme is not in the hostable directory
- **WHEN** a fixture is ejected in detached mode
- **THEN** the rows the organiser keeps editing are outside `site/`, so hosting `site/` cannot publish a session the published agenda withholds
- **PROVEN BY** `backend/test/unit/eject-detached.test.ts`
