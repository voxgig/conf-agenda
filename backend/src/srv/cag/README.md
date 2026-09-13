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

## Flow

```mermaid
flowchart LR
  gateway{{gateway}} -->|validated msg| srv[srv cag]
  srv --> validate_fixture["aim:cag,validate:fixture<br>validate_fixture.ts"]
  srv --> publish_fixture["aim:cag,publish:fixture<br>publish_fixture.ts"]
  srv --> load_tree["aim:cag,load:tree<br>load_tree.ts"]
  srv --> web_load_tree["aim:web,on:cag,load:tree<br>web_load_tree.ts"]
```

Message params are validated from the model (gubu); see
`../../../model/` and `docs/reference/messages.md` at the project root.
