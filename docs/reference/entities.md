# Reference: entities (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — the entity graph, derived from the model.*

## Entity relationship diagram

Relationships come from `ref` fields (the field stores the id of the
target entity).

```mermaid
erDiagram
  sys_login {
    String id
  }
  sys_user {
    String id
  }
```

(Entity ids are canons with `/` shown as `_`.)

## Entities

| Canon | Fields | Relationships | UI |
|---|---|---|---|
| `sys/login` | id | — | generic admin |
| `sys/user` | id | — | generic admin |
