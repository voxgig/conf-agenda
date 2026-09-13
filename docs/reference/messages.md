# Reference: messages (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — services and the messages they answer, derived
from the model. Action files follow the MakeSrv convention (last
pattern pair: `save:item` → `save_item`).*

## Message flow

```mermaid
flowchart LR
  client([Clients / SPA])
  gateway{{gateway}}
  client -->|aim:* messages| gateway
  agenda[srv agenda]
  gateway -->|aim:agenda| agenda
  auth[srv auth]
  gateway -->|aim:auth| auth
  gateway -->|aim:web| auth
  cag[srv cag]
  gateway -->|aim:cag| cag
  gateway -->|aim:web| cag
```

## Service: agenda

| Message | Action file |
|---|---|
| `aim:agenda,get:agenda` | `src/srv/agenda/get_agenda.ts` |

## Service: auth

| Message | Action file |
|---|---|
| `aim:web,on:cag,load:tree` | `src/srv/auth/web_load_tree.ts` |

## Service: cag

| Message | Action file |
|---|---|
| `aim:cag,validate:fixture` | `src/srv/cag/validate_fixture.ts` |
| `aim:cag,publish:fixture` | `src/srv/cag/publish_fixture.ts` |
| `aim:cag,load:tree` | `src/srv/cag/load_tree.ts` |
| `aim:web,on:cag,load:tree` | `src/srv/cag/web_load_tree.ts` |
