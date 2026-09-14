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
| `aim:agenda,get:feed` | `src/srv/agenda/get_feed.ts` |

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
| `aim:web,on:cag,list:room` | `src/srv/auth/web_list_room.ts` |
| `aim:web,on:cag,load:room` | `src/srv/auth/web_load_room.ts` |
| `aim:web,on:cag,list:track` | `src/srv/auth/web_list_track.ts` |
| `aim:web,on:cag,load:track` | `src/srv/auth/web_load_track.ts` |
| `aim:web,on:cag,list:speaker` | `src/srv/auth/web_list_speaker.ts` |
| `aim:web,on:cag,load:speaker` | `src/srv/auth/web_load_speaker.ts` |
| `aim:web,on:cag,list:appearance` | `src/srv/auth/web_list_appearance.ts` |
| `aim:web,on:cag,load:appearance` | `src/srv/auth/web_load_appearance.ts` |
| `aim:web,on:cag,list:snapshot` | `src/srv/auth/web_list_snapshot.ts` |
| `aim:web,on:cag,load:snapshot` | `src/srv/auth/web_load_snapshot.ts` |

## Service: cag

| Message | Action file |
|---|---|
| `aim:cag,validate:fixture` | `src/srv/cag/validate_fixture.ts` |
| `aim:cag,publish:fixture` | `src/srv/cag/publish_fixture.ts` |
| `aim:cag,load:tree` | `src/srv/cag/load_tree.ts` |
| `aim:cag,list:room` | `src/srv/cag/list_room.ts` |
| `aim:cag,load:room` | `src/srv/cag/load_room.ts` |
| `aim:cag,list:track` | `src/srv/cag/list_track.ts` |
| `aim:cag,load:track` | `src/srv/cag/load_track.ts` |
| `aim:cag,list:speaker` | `src/srv/cag/list_speaker.ts` |
| `aim:cag,load:speaker` | `src/srv/cag/load_speaker.ts` |
| `aim:cag,list:appearance` | `src/srv/cag/list_appearance.ts` |
| `aim:cag,load:appearance` | `src/srv/cag/load_appearance.ts` |
| `aim:cag,list:snapshot` | `src/srv/cag/list_snapshot.ts` |
| `aim:cag,load:snapshot` | `src/srv/cag/load_snapshot.ts` |
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
| `aim:web,on:cag,list:room` | `src/srv/cag/web_list_room.ts` |
| `aim:web,on:cag,load:room` | `src/srv/cag/web_load_room.ts` |
| `aim:web,on:cag,list:track` | `src/srv/cag/web_list_track.ts` |
| `aim:web,on:cag,load:track` | `src/srv/cag/web_load_track.ts` |
| `aim:web,on:cag,list:speaker` | `src/srv/cag/web_list_speaker.ts` |
| `aim:web,on:cag,load:speaker` | `src/srv/cag/web_load_speaker.ts` |
| `aim:web,on:cag,list:appearance` | `src/srv/cag/web_list_appearance.ts` |
| `aim:web,on:cag,load:appearance` | `src/srv/cag/web_load_appearance.ts` |
| `aim:web,on:cag,list:snapshot` | `src/srv/cag/web_list_snapshot.ts` |
| `aim:web,on:cag,load:snapshot` | `src/srv/cag/web_load_snapshot.ts` |
