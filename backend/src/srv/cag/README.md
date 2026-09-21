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
| `aim:cag,plan:sync` | `plan_sync.ts` |
| `aim:cag,apply:sync` | `apply_sync.ts` |
| `aim:cag,move:segment` | `move_segment.ts` |
| `aim:cag,set:status` | `set_status.ts` |
| `aim:cag,make:segment` | `make_segment.ts` |
| `aim:cag,duplicate:segment` | `duplicate_segment.ts` |
| `aim:cag,remove:segment` | `remove_segment.ts` |
| `aim:cag,add:appearance` | `add_appearance.ts` |
| `aim:cag,remove:appearance` | `remove_appearance.ts` |
| `aim:cag,watch:run` | `watch_run.ts` |
| `aim:cag,make:room` | `make_room.ts` |
| `aim:cag,update:room` | `update_room.ts` |
| `aim:cag,remove:room` | `remove_room.ts` |
| `aim:cag,make:track` | `make_track.ts` |
| `aim:cag,update:track` | `update_track.ts` |
| `aim:cag,remove:track` | `remove_track.ts` |
| `aim:cag,make:speaker` | `make_speaker.ts` |
| `aim:cag,update:speaker` | `update_speaker.ts` |
| `aim:cag,remove:speaker` | `remove_speaker.ts` |
| `aim:cag,update:appearance` | `update_appearance.ts` |
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
| `aim:web,on:cag,plan:sync` | `web_plan_sync.ts` |
| `aim:web,on:cag,apply:sync` | `web_apply_sync.ts` |
| `aim:web,on:cag,watch:run` | `web_watch_run.ts` |
| `aim:web,on:cag,validate:fixture` | `web_validate_fixture.ts` |
| `aim:web,on:cag,publish:fixture` | `web_publish_fixture.ts` |
| `aim:web,on:cag,move:segment` | `web_move_segment.ts` |
| `aim:web,on:cag,set:status` | `web_set_status.ts` |
| `aim:web,on:cag,make:segment` | `web_make_segment.ts` |
| `aim:web,on:cag,duplicate:segment` | `web_duplicate_segment.ts` |
| `aim:web,on:cag,remove:segment` | `web_remove_segment.ts` |
| `aim:web,on:cag,add:appearance` | `web_add_appearance.ts` |
| `aim:web,on:cag,remove:appearance` | `web_remove_appearance.ts` |
| `aim:web,on:cag,make:room` | `web_make_room.ts` |
| `aim:web,on:cag,update:room` | `web_update_room.ts` |
| `aim:web,on:cag,remove:room` | `web_remove_room.ts` |
| `aim:web,on:cag,make:track` | `web_make_track.ts` |
| `aim:web,on:cag,update:track` | `web_update_track.ts` |
| `aim:web,on:cag,remove:track` | `web_remove_track.ts` |
| `aim:web,on:cag,make:speaker` | `web_make_speaker.ts` |
| `aim:web,on:cag,update:speaker` | `web_update_speaker.ts` |
| `aim:web,on:cag,remove:speaker` | `web_remove_speaker.ts` |
| `aim:web,on:cag,update:appearance` | `web_update_appearance.ts` |
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
  srv --> plan_sync["aim:cag,plan:sync<br>plan_sync.ts"]
  srv --> apply_sync["aim:cag,apply:sync<br>apply_sync.ts"]
  srv --> move_segment["aim:cag,move:segment<br>move_segment.ts"]
  srv --> set_status["aim:cag,set:status<br>set_status.ts"]
  srv --> make_segment["aim:cag,make:segment<br>make_segment.ts"]
  srv --> duplicate_segment["aim:cag,duplicate:segment<br>duplicate_segment.ts"]
  srv --> remove_segment["aim:cag,remove:segment<br>remove_segment.ts"]
  srv --> add_appearance["aim:cag,add:appearance<br>add_appearance.ts"]
  srv --> remove_appearance["aim:cag,remove:appearance<br>remove_appearance.ts"]
  srv --> watch_run["aim:cag,watch:run<br>watch_run.ts"]
  srv --> make_room["aim:cag,make:room<br>make_room.ts"]
  srv --> update_room["aim:cag,update:room<br>update_room.ts"]
  srv --> remove_room["aim:cag,remove:room<br>remove_room.ts"]
  srv --> make_track["aim:cag,make:track<br>make_track.ts"]
  srv --> update_track["aim:cag,update:track<br>update_track.ts"]
  srv --> remove_track["aim:cag,remove:track<br>remove_track.ts"]
  srv --> make_speaker["aim:cag,make:speaker<br>make_speaker.ts"]
  srv --> update_speaker["aim:cag,update:speaker<br>update_speaker.ts"]
  srv --> remove_speaker["aim:cag,remove:speaker<br>remove_speaker.ts"]
  srv --> update_appearance["aim:cag,update:appearance<br>update_appearance.ts"]
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
  srv --> web_plan_sync["aim:web,on:cag,plan:sync<br>web_plan_sync.ts"]
  srv --> web_apply_sync["aim:web,on:cag,apply:sync<br>web_apply_sync.ts"]
  srv --> web_watch_run["aim:web,on:cag,watch:run<br>web_watch_run.ts"]
  srv --> web_validate_fixture["aim:web,on:cag,validate:fixture<br>web_validate_fixture.ts"]
  srv --> web_publish_fixture["aim:web,on:cag,publish:fixture<br>web_publish_fixture.ts"]
  srv --> web_move_segment["aim:web,on:cag,move:segment<br>web_move_segment.ts"]
  srv --> web_set_status["aim:web,on:cag,set:status<br>web_set_status.ts"]
  srv --> web_make_segment["aim:web,on:cag,make:segment<br>web_make_segment.ts"]
  srv --> web_duplicate_segment["aim:web,on:cag,duplicate:segment<br>web_duplicate_segment.ts"]
  srv --> web_remove_segment["aim:web,on:cag,remove:segment<br>web_remove_segment.ts"]
  srv --> web_add_appearance["aim:web,on:cag,add:appearance<br>web_add_appearance.ts"]
  srv --> web_remove_appearance["aim:web,on:cag,remove:appearance<br>web_remove_appearance.ts"]
  srv --> web_make_room["aim:web,on:cag,make:room<br>web_make_room.ts"]
  srv --> web_update_room["aim:web,on:cag,update:room<br>web_update_room.ts"]
  srv --> web_remove_room["aim:web,on:cag,remove:room<br>web_remove_room.ts"]
  srv --> web_make_track["aim:web,on:cag,make:track<br>web_make_track.ts"]
  srv --> web_update_track["aim:web,on:cag,update:track<br>web_update_track.ts"]
  srv --> web_remove_track["aim:web,on:cag,remove:track<br>web_remove_track.ts"]
  srv --> web_make_speaker["aim:web,on:cag,make:speaker<br>web_make_speaker.ts"]
  srv --> web_update_speaker["aim:web,on:cag,update:speaker<br>web_update_speaker.ts"]
  srv --> web_remove_speaker["aim:web,on:cag,remove:speaker<br>web_remove_speaker.ts"]
  srv --> web_update_appearance["aim:web,on:cag,update:appearance<br>web_update_appearance.ts"]
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
