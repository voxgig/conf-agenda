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

## Flow

```mermaid
flowchart LR
  gateway{{gateway}} -->|validated msg| srv[srv cag]
  srv --> validate_fixture["aim:cag,validate:fixture<br>validate_fixture.ts"]
  srv --> publish_fixture["aim:cag,publish:fixture<br>publish_fixture.ts"]
  srv --> load_tree["aim:cag,load:tree<br>load_tree.ts"]
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
```

Message params are validated from the model (gubu); see
`../../../model/` and `docs/reference/messages.md` at the project root.
