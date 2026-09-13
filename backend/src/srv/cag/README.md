# Service: cag (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

Answers `aim:cag`, `aim:web` messages, loaded by convention (`@voxgig/system` MakeSrv): each
message maps to the action file named after its last pattern pair.

Requires a signed-in user (`user.required: true`).

## Messages

| Message | Action file |
|---|---|
| `aim:cag,validate:fixture` | `validate_fixture.ts` |
| `aim:cag,publish:fixture` | `publish_fixture.ts` |
| `aim:cag,load:tree` | `load_tree.ts` |
| `aim:cag,list:room` | `list_room.ts` |
| `aim:cag,load:room` | `load_room.ts` |
| `aim:cag,list:track` | `list_track.ts` |
| `aim:cag,load:track` | `load_track.ts` |
| `aim:cag,list:speaker` | `list_speaker.ts` |
| `aim:cag,load:speaker` | `load_speaker.ts` |
| `aim:cag,list:appearance` | `list_appearance.ts` |
| `aim:cag,load:appearance` | `load_appearance.ts` |
| `aim:cag,list:snapshot` | `list_snapshot.ts` |
| `aim:cag,load:snapshot` | `load_snapshot.ts` |
| `aim:web,on:cag,load:tree` | `web_load_tree.ts` |
| `aim:web,on:auth,signin:user` | `web_signin_user.ts` |
| `aim:web,on:auth,signout:user` | `web_signout_user.ts` |
| `aim:web,on:auth,load:auth` | `web_load_auth.ts` |
| `aim:web,on:auth,change:pass` | `web_change_pass.ts` |
| `aim:web,on:auth,update:user` | `web_update_user.ts` |
| `aim:web,on:auth,remind:pass` | `web_remind_pass.ts` |
| `aim:web,on:auth,create:apikey` | `web_create_apikey.ts` |
| `aim:web,on:auth,list:apikey` | `web_list_apikey.ts` |
| `aim:web,on:auth,revoke:apikey` | `web_revoke_apikey.ts` |
| `aim:web,on:cag,list:room` | `web_list_room.ts` |
| `aim:web,on:cag,load:room` | `web_load_room.ts` |
| `aim:web,on:cag,list:track` | `web_list_track.ts` |
| `aim:web,on:cag,load:track` | `web_load_track.ts` |
| `aim:web,on:cag,list:speaker` | `web_list_speaker.ts` |
| `aim:web,on:cag,load:speaker` | `web_load_speaker.ts` |
| `aim:web,on:cag,list:appearance` | `web_list_appearance.ts` |
| `aim:web,on:cag,load:appearance` | `web_load_appearance.ts` |
| `aim:web,on:cag,list:snapshot` | `web_list_snapshot.ts` |
| `aim:web,on:cag,load:snapshot` | `web_load_snapshot.ts` |

## Flow

```mermaid
flowchart LR
  gateway{{gateway}} -->|validated msg| srv[srv cag]
  srv --> validate_fixture["aim:cag,validate:fixture<br>validate_fixture.ts"]
  srv --> publish_fixture["aim:cag,publish:fixture<br>publish_fixture.ts"]
  srv --> load_tree["aim:cag,load:tree<br>load_tree.ts"]
  srv --> list_room["aim:cag,list:room<br>list_room.ts"]
  srv --> load_room["aim:cag,load:room<br>load_room.ts"]
  srv --> list_track["aim:cag,list:track<br>list_track.ts"]
  srv --> load_track["aim:cag,load:track<br>load_track.ts"]
  srv --> list_speaker["aim:cag,list:speaker<br>list_speaker.ts"]
  srv --> load_speaker["aim:cag,load:speaker<br>load_speaker.ts"]
  srv --> list_appearance["aim:cag,list:appearance<br>list_appearance.ts"]
  srv --> load_appearance["aim:cag,load:appearance<br>load_appearance.ts"]
  srv --> list_snapshot["aim:cag,list:snapshot<br>list_snapshot.ts"]
  srv --> load_snapshot["aim:cag,load:snapshot<br>load_snapshot.ts"]
  srv --> web_load_tree["aim:web,on:cag,load:tree<br>web_load_tree.ts"]
  srv --> web_signin_user["aim:web,on:auth,signin:user<br>web_signin_user.ts"]
  srv --> web_signout_user["aim:web,on:auth,signout:user<br>web_signout_user.ts"]
  srv --> web_load_auth["aim:web,on:auth,load:auth<br>web_load_auth.ts"]
  srv --> web_change_pass["aim:web,on:auth,change:pass<br>web_change_pass.ts"]
  srv --> web_update_user["aim:web,on:auth,update:user<br>web_update_user.ts"]
  srv --> web_remind_pass["aim:web,on:auth,remind:pass<br>web_remind_pass.ts"]
  srv --> web_create_apikey["aim:web,on:auth,create:apikey<br>web_create_apikey.ts"]
  srv --> web_list_apikey["aim:web,on:auth,list:apikey<br>web_list_apikey.ts"]
  srv --> web_revoke_apikey["aim:web,on:auth,revoke:apikey<br>web_revoke_apikey.ts"]
  srv --> web_list_room["aim:web,on:cag,list:room<br>web_list_room.ts"]
  srv --> web_load_room["aim:web,on:cag,load:room<br>web_load_room.ts"]
  srv --> web_list_track["aim:web,on:cag,list:track<br>web_list_track.ts"]
  srv --> web_load_track["aim:web,on:cag,load:track<br>web_load_track.ts"]
  srv --> web_list_speaker["aim:web,on:cag,list:speaker<br>web_list_speaker.ts"]
  srv --> web_load_speaker["aim:web,on:cag,load:speaker<br>web_load_speaker.ts"]
  srv --> web_list_appearance["aim:web,on:cag,list:appearance<br>web_list_appearance.ts"]
  srv --> web_load_appearance["aim:web,on:cag,load:appearance<br>web_load_appearance.ts"]
  srv --> web_list_snapshot["aim:web,on:cag,list:snapshot<br>web_list_snapshot.ts"]
  srv --> web_load_snapshot["aim:web,on:cag,load:snapshot<br>web_load_snapshot.ts"]
```

Message params are validated from the model (gubu); see
`../../../model/` and `docs/reference/messages.md` at the project root.
