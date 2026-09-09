# Reference: the model

*Diátaxis: reference - the model source files in `backend/model/`.*

| File | Holds |
|---|---|
| `model.aon` | Root: imports, entity shape, build config |
| `ent.aon` | Entities (`<zone>: <name>: { field: ... }`) |
| `srv.aon` | Services (which messages each service answers) |
| `msg.aon` | Messages (`aim: <srv>: <verb>: <noun>: {}` + params) |
| `env.aon` | Target environments (local/aws/web/...) |
| `theme.aon` | Design theme: named modes of design tokens |
| `conf.aon` | Core config: name, auth token, ports |
| `.model-config/` | Generation actions run by model-build |

`npm run model-build` unifies these (aontu) into `model/model.json`,
then runs the generation actions.

## Conventions

- Comments are `#` (jsonic); `##` is prose, single `#` is disabled
  example code. Quote values containing `-`, `/`, or `#`.
- Entity fields: `kind` (String/Number/Boolean), `label`, `valid`
  (gubu expression; `Skip` = optional).
- Relationship: `kind: String` + `ref: 'zone/name'` (+ usually
  `valid: Skip`).
- Custom entity view (web app): `ux: { view: 'custom' }` on the entity.
- Messages map to action files by the LAST pattern pair:
  `thing.save.item` -> `src/srv/thing/save_item.ts`.
- Message params are closed by default; `'$$': 'Open'` opens an object
  to additional properties.

## Generated diagrams

Model-build regenerates diagram references from the model on every run:
[entities](entities.md) (ER diagram), [messages](messages.md) (message
flows per service), [system map](system-map.md) (architecture and
dependencies) - plus a README per implemented service under
`backend/src/srv/<srv>/`. They are AUTO-GENERATED; never hand-edit.
