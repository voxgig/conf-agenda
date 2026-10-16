# public-agenda-edge Specification

## Purpose
Serving the published agenda, its `.ics` and `.csv` feeds and their cache semantics from an edge
Worker backed by a KV snapshot, with no application runtime in the request path, so the public read
path costs a key lookup rather than a service boot.

## Requirements

### Requirement: The edge serves the same public URL shape
The Worker SHALL serve `/agenda/<org>/<slug>.<ext>` for `json`, `ics` and `csv`, and SHALL serve no
other route. The URL shape SHALL match the one the Express runner serves and the one the embed
defaults to, so pointing a `<conf-agenda>` element at an edge deployment is a host swap rather than
a different route.

#### Scenario: The published agenda is served as JSON
- **WHEN** a request arrives for a slug whose snapshot is in the KV namespace, with extension `json`
- **THEN** the response is 200 carrying the stored snapshot
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

#### Scenario: An unknown extension is refused
- **WHEN** a request arrives with an extension that is not `json`, `ics` or `csv`
- **THEN** the response is 404 and names the format
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

#### Scenario: Any other path is refused
- **WHEN** a request arrives for a path outside `/agenda/<org>/<slug>.<ext>`
- **THEN** the response is 404 and no KV read is attempted
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`, counting reads on the KV fake

### Requirement: The agenda is served byte for byte
The Worker SHALL return the stored snapshot bytes unchanged for the `json` extension, without
parsing and reserialising. SPEC §17 requires every derived file to be byte-identical for identical
input, and the published content hash depends on it.

#### Scenario: The body equals the stored value exactly
- **WHEN** a snapshot is stored and then fetched as `json`
- **THEN** the response body is identical to the stored string, including key order and whitespace
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

### Requirement: The edge and the local runner serve identical feeds
The Worker SHALL build `.ics` and `.csv` with the same functions the service path uses, so the two
surfaces cannot serve different feeds for the same conference.

#### Scenario: The feeds match the service message
- **WHEN** the same snapshot is served as `ics` and as `csv` by the Worker and by `aim:agenda,get:feed`
- **THEN** both bodies are byte-identical between the two surfaces
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

#### Scenario: A calendar client is given a readable feed
- **WHEN** a feed is requested
- **THEN** its content type is the calendar or CSV type and its `Content-Disposition` is `inline`, so a subscribing client reads it rather than downloading it
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

### Requirement: Cache and origin headers match the existing public path
The Worker SHALL set the same `Cache-Control` and `Access-Control-Allow-Origin` headers the Express
public route sets, so moving a conference to the edge does not change how caches or third-party
pages treat it.

#### Scenario: The JSON response is publicly cacheable and revalidated
- **WHEN** the agenda is served as `json`
- **THEN** `Cache-Control` permits public caching with a short max-age and a longer stale-while-revalidate window, and `Access-Control-Allow-Origin` is `*`
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`, comparing against the values in `src/env/web/web.ts`

#### Scenario: A feed is cached for longer than the agenda
- **WHEN** a feed is served
- **THEN** its max-age is longer than the agenda's, matching the existing route
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

### Requirement: An unpublished conference is refused, not invented
The Worker SHALL answer 404 with `not-published` when no snapshot exists for the requested key, and
SHALL NOT compose an agenda from any other source.

#### Scenario: Nothing in KV for that key
- **WHEN** a request names a conference with no stored snapshot
- **THEN** the response is 404 and its reason is `not-published`, the same word the service path uses
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

### Requirement: No application runtime in the request path
The Worker SHALL contain no Seneca instance, no gateway plugin and no service wiring. The published
read path is a key lookup, and §17's 200ms TTFB budget does not permit a per-request service boot,
which the Cloudflare spike measured at 135 to 155ms.

#### Scenario: The bundle carries no service runtime
- **WHEN** the Worker's module graph is inspected
- **THEN** it reaches no Seneca package, no gateway plugin and no store, and the only project module it imports is the pure feed builder
- **PROVEN BY** `backend/test/unit/worker-agenda.test.ts`

#### Scenario: It answers inside the budget locally
- **WHEN** the Worker is run under `wrangler dev --local` against a seeded namespace
- **THEN** time-to-first-byte for the agenda is well inside 200ms, and the figure is recorded
- **PROVEN BY** the measurement recorded in `docs/decisions/`
