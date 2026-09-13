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
| `aim:auth,get:info` | `src/srv/auth/get_info.ts` |
| `aim:auth,signin:user` | `src/srv/auth/signin_user.ts` |
| `aim:auth,signout:user` | `src/srv/auth/signout_user.ts` |
| `aim:auth,load:auth` | `src/srv/auth/load_auth.ts` |
| `aim:auth,change:pass` | `src/srv/auth/change_pass.ts` |
| `aim:auth,update:user` | `src/srv/auth/update_user.ts` |
| `aim:auth,remind:pass` | `src/srv/auth/remind_pass.ts` |
| `aim:auth,create:apikey` | `src/srv/auth/create_apikey.ts` |
| `aim:auth,list:apikey` | `src/srv/auth/list_apikey.ts` |
| `aim:auth,revoke:apikey` | `src/srv/auth/revoke_apikey.ts` |
| `aim:web,on:cag,load:tree` | `src/srv/auth/web_load_tree.ts` |
| `aim:web,on:auth,signin:user` | `src/srv/auth/web_signin_user.ts` |
| `aim:web,on:auth,signout:user` | `src/srv/auth/web_signout_user.ts` |
| `aim:web,on:auth,load:auth` | `src/srv/auth/web_load_auth.ts` |
| `aim:web,on:auth,change:pass` | `src/srv/auth/web_change_pass.ts` |
| `aim:web,on:auth,update:user` | `src/srv/auth/web_update_user.ts` |
| `aim:web,on:auth,remind:pass` | `src/srv/auth/web_remind_pass.ts` |
| `aim:web,on:auth,create:apikey` | `src/srv/auth/web_create_apikey.ts` |
| `aim:web,on:auth,list:apikey` | `src/srv/auth/web_list_apikey.ts` |
| `aim:web,on:auth,revoke:apikey` | `src/srv/auth/web_revoke_apikey.ts` |

## Service: cag

| Message | Action file |
|---|---|
| `aim:cag,validate:fixture` | `src/srv/cag/validate_fixture.ts` |
| `aim:cag,publish:fixture` | `src/srv/cag/publish_fixture.ts` |
| `aim:cag,load:tree` | `src/srv/cag/load_tree.ts` |
| `aim:web,on:cag,load:tree` | `src/srv/cag/web_load_tree.ts` |
| `aim:web,on:auth,signin:user` | `src/srv/cag/web_signin_user.ts` |
| `aim:web,on:auth,signout:user` | `src/srv/cag/web_signout_user.ts` |
| `aim:web,on:auth,load:auth` | `src/srv/cag/web_load_auth.ts` |
| `aim:web,on:auth,change:pass` | `src/srv/cag/web_change_pass.ts` |
| `aim:web,on:auth,update:user` | `src/srv/cag/web_update_user.ts` |
| `aim:web,on:auth,remind:pass` | `src/srv/cag/web_remind_pass.ts` |
| `aim:web,on:auth,create:apikey` | `src/srv/cag/web_create_apikey.ts` |
| `aim:web,on:auth,list:apikey` | `src/srv/cag/web_list_apikey.ts` |
| `aim:web,on:auth,revoke:apikey` | `src/srv/cag/web_revoke_apikey.ts` |
