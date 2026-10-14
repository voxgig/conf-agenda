## Purpose

What the backend's `npm test` runs, so that a compiled test file at any depth under
`dist-test/unit/` is part of the gate, and so that the generated suites for the removed generic
entity surface pin that it stays removed instead of looking like coverage.

## ADDED Requirements

### Requirement: The backend unit run reaches every compiled test file
`npm test` in `backend/` SHALL run every `*.test.js` file under `dist-test/unit/`, at any depth,
and SHALL NOT depend on a file being listed by name to be run.

#### Scenario: A nested suite runs without being named
- **WHEN** `npm test` runs after `npm run build`
- **THEN** its TAP output reports the suites in `srv/auth/apikey.test.js` and `srv/auth/session.test.js` (13 tests) and in `env/web/api-router.test.js`, and the `test` script names no single file
- **PROVEN BY** `cd backend && npm run build && npm test`, reading `# tests` against the expected total of 378 and the exit code 0

#### Scenario: A new test file in a new subdirectory is picked up
- **WHEN** a `*.test.ts` file is added under a new subdirectory of `backend/test/unit/` and the backend is rebuilt
- **THEN** `npm test` runs it with no change to `package.json`
- **PROVEN BY** a throwaway `backend/test/unit/zz/probe.test.ts` holding one failing test: `npm test` exits 1 naming it, and exits 0 again once it is removed and `dist-test/unit/zz/` is cleared

### Requirement: The generated generic-surface suites assert the surface is absent
The suites `@voxgig/build` creates once for the generic `ent` and `api` services
(`test/unit/srv/api/api.test.ts`, `test/unit/srv/ent/proxy.test.ts`) SHALL assert that the
service they were written for is not declared, and SHALL each assert a known-present case, so
that neither can pass over an empty or reshaped model.

#### Scenario: The generic REST entity service is absent
- **WHEN** `srv/api/api.test.js` runs
- **THEN** it asserts `api` is not a key of `main.srv` and no `main.msg` pattern starts with `aim:api`, and it asserts `cag` is a key of `main.srv`
- **PROVEN BY** `backend/test/unit/srv/api/api.test.ts`

#### Scenario: The generic browser entity proxy is absent from a booted service
- **WHEN** `srv/ent/proxy.test.js` boots the shared plugins and the `cag` service
- **THEN** `aim:web,on:ent,cmd:list` has no action, `ent` is not a key of `main.srv`, and `aim:web,on:cag,load:tree` has an action
- **PROVEN BY** `backend/test/unit/srv/ent/proxy.test.ts`

#### Scenario: The absence assertions bite
- **WHEN** `ent: {}` is added to `main.srv` in the compiled model the test reads, or the `cag` registration is dropped from the boot
- **THEN** the matching test fails
- **PROVEN BY** the bite check in tasks.md, run by hand and reverted

### Requirement: The gateway allow-list stays pinned
`test/unit/env/web/surface.test.ts` SHALL keep asserting that the gateway allow-list literal in
`src/env/web/web.ts` names `aim:web` and nothing else, and SHALL hold no test that reads
`main.msg` as a map.

#### Scenario: The allow-list is read off the source
- **WHEN** `env/web/surface.test.js` runs
- **THEN** it finds the `allow:` literal in `src/env/web/web.ts` and asserts its only key is `aim:web`
- **PROVEN BY** `backend/test/unit/env/web/surface.test.ts`
