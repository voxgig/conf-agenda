# How to use the REST API

*Diátaxis: how-to guide — the strict-JSON REST API generated from the
model (`main.api` in `backend/model/api.aontu`).*

## Get an API key

Sign in to the web app → user menu → **Settings & security** → **API
keys** → create a key. Copy it immediately — it is shown only once (only
a hash is stored). Revoke keys there too; revocation is immediate.

## Call the API

Uniform semantic paths per entity — `<prefix>/<version>/<zone>/<name>`:

```bash
KEY=vk_...
B=http://localhost:8080/api/v1

curl -H "Authorization: Bearer $KEY" $B/proj/project            # list
curl -H "Authorization: Bearer $KEY" "$B/proj/project?name=X"   # filtered list
curl -H "Authorization: Bearer $KEY" $B/proj/project/<id>       # load
curl -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"name":"New project"}' $B/proj/project                   # create -> 201
curl -X PUT -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"note":"updated"}' $B/proj/project/<id>                  # partial update
curl -X DELETE -H "Authorization: Bearer $KEY" $B/proj/project/<id>
```

Results: `{ items: [...] }` (list), `{ item: {...} }` (load/create/update),
`{ ok: true, id }` (delete). Errors carry an HTTP status and
`{ error: { code, message?, details? } }`.

The API is **strict**: request bodies are validated against the entity's
model definition (generated shapes) — unknown fields are rejected (400),
required fields enforced, server-managed fields (`id`, `owner_id`,
`t_c`, `t_m`) are read-only. Access is the same project-membership
scoping as the web app, as the key's owning user.

## The OpenAPI spec

Generated from the model on every model-build:
`backend/gen/api/openapi.json`, also served unauthenticated at
`<prefix>/openapi.json`. Schemas come from the entity field definitions;
operation ids are uniform (`list_<zone>_<name>`, `create_...`, ...) so an
SDK can be generated from it (e.g. with sdkgen).

## Configure

`backend/model/api.aontu` — `prefix`, `version`, `active`, and per-entity
exposure (`ent: 'zone/name': { active: false }`). The sys zone is never
exposed. Run `npm run model-build` after changes.
