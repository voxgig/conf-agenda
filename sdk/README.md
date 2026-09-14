# SDKs — not yet generating

PLATFORM.md §4 defines the chain:

```
model/*.aon → gen/api/openapi.yaml → sdk/.sdk/def/openapi.yaml
            → @voxgig/apidef → sdk/.sdk/model/api/*
            → @voxgig/sdkgen → sdk/{ts,go,py,rb,go-cli,go-mcp}
```

**The first link works.** `npm run model-build` in `backend/` produces
`backend/gen/api/openapi.json` and `.yaml` — OpenAPI 3.1, twelve paths covering the five `cag`
entities. That half needs nothing.

**The chain cannot be bootstrapped from an OpenAPI file alone.** Both tools require a `.sdk/`
scaffold that neither of them creates:

| Command | Wants | Result |
|---|---|---|
| `voxgig-sdkgen target add ts` | `./model/sdk.aon` | `ENOENT` |
| `voxgig-apidef openapi.yaml` | `model/api.aontu` | shape error |

Note the two tools disagree on the extension — `sdk.aon` from sdkgen, `api.aontu` from apidef.
That is the **third** extension inconsistency this project has hit; see
`docs/decisions/web-env-and-generic-ent.md` for the others (`@voxgig/system`'s CLI wants
`model.aontu` while `@voxgig/create-system` writes `model.aon`, which is what PLATFORM.md §1.3
mandates and todo-app uses).

## The way in

`metsitaba/todo-app` has a working `sdk/.sdk/` — roughly thirty files: `model/sdk.aontu`,
`model/config.aontu`, `model/api/`, `model/entity/`, `model/flow/`, `model/target/`, plus
`build/{apidef,sdkgen,docgen}.js`. Its own `model/entity/*.aontu` are per-entity and clearly
derived from its OpenAPI, so the likely path is:

1. copy todo-app's `.sdk/` shell (config, `sdk.aontu`, `.model-config`, `build/`),
2. drop **our** `openapi.yaml` into `.sdk/def/`,
3. run `apidef`, which should regenerate `model/entity/*` and `model/api/*` from it,
4. `voxgig-sdkgen target add ts`.

Untried. It is the same "follow the working reference rather than invent" move that settled
`msg.aon`'s list form and the podmind widget structure, and it is the next thing to attempt.

## Why this is not blocking

SPEC §19.1 puts "REST API + SDKs" at **▁ stub** for Stage 1, and §19.3's acceptance criteria are
the `tiny` conference publishing, the embed rendering it, and `validate` blocking on the clash —
none of which needs a generated client. The other three Stage 1 surfaces (CLI, REPL, MCP) are
built and verified.
