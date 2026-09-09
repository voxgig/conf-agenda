# Agent guide: conf-agenda

A Voxgig system project: a Seneca microservices backend driven by a
model (`backend/model/*.aon` -> `model.json`). See [docs/](docs/)
for concepts; this file is operational guidance. The web app (if
generated) has its own guide at `web/AGENTS.md`.

## Commands (run in backend/)

```bash
npm run build         # model-build (compile model + codegen) + tsc
npm run model-build   # just compile the model + run generation
npm test              # unit tests (in-memory store, no externals)
npm run local         # boot the backend locally
# dev REPL on conf.port.repl (default 50502) in local+web runners:
#   npx seneca-repl telnet://localhost:50502   (REPL=false disables)
```

Change the model? Always `npm run model-build` before expecting any
generated artifact or the web UI to reflect it.

## Layout

- `backend/model/` - the model sources: `ent.aon` (entities),
  `srv.aon` (services), `msg.aon` (messages), `env.aon`
  (environments), `theme.aon` (design theme), `conf.aon` (config).
- `backend/src/srv/<srv>/` - service actions; a model message maps to
  the file named after its LAST pattern pair (`save:item` ->
  `save_item.ts`).
- `backend/src/env/` - runtime entries (shared/local/lambda/web).
- `web/` - the generated SPA (developer-owned, create-once).

## Conventions and gotchas

- Prefer `npx voxgig-system add entity|srv|msg|field|env ...` over
  hand-editing model files - it appends jsonic blocks and preserves
  formatting. Aontu comments are `#` only; quote values containing
  `-`, `/`, or `#`.
- In generated files, `##` (jsonic) / `////` (TS) are prose; a single
  `#` / `//` marks disabled example code.
- Relationship fields: `kind: String` plus a `ref: 'zone/name'`
  attribute (usually also `valid: Skip`). `kind: 'Ref'` is invalid.
- Only declare a model message when its action file exists - boot fails
  otherwise.
- Generated deployment artifacts (`backend/gen/`) are regenerated every
  model-build: never hand-edit. Application code (`src/`, `web/`) is
  create-once: yours to edit freely.
