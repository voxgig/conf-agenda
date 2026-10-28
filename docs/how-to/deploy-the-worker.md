# How to deploy the public agenda Worker

*Diátaxis: how-to guide - put the edge read path on a real Cloudflare account and prove it works.*

The Worker (`backend/src/env/cloudflare/worker.ts`) serves `/agenda/<org>/<slug>.{json,ics,csv}`
from a KV namespace. The generated config has two deploy targets, one per Cloudflare account:

| Target | Account | Worker | URL |
|---|---|---|---|
| `own` | Jose's (`0eea1717...`) | `conf-agenda-own` | `https://conf-agenda-own.jose-perigolo.workers.dev` |
| `voxgig` | Richard's (`7bfad364...`) | `conf-agenda` | `https://agenda.voxgig.com` |

`own` is a scratch target: anything can be tried there first. The steps below use it. For
`voxgig`, swap `own` for `voxgig` and the account id. On `main`, Workers Builds runs the voxgig
deploy once its Deploy command is `npm run deploy`.

All commands run from the repo root. `C` is the generated config:

```bash
C=backend/gen/env/cloudflare/wrangler.toml
```

## 1. Log in

```bash
wrangler login
wrangler whoami        # both accounts should be listed
```

`wrangler login` gives a user token, so one login reaches both accounts. After any change to your
role on either account, run `wrangler logout && wrangler login` again: a token keeps the
permissions it had when it was issued.

## 2. Make a namespace (once per account)

```bash
CLOUDFLARE_ACCOUNT_ID=0eea17179e115954177ae5bd5aa2383e wrangler kv namespace create conf-agenda-agenda
```

Put the printed id in `backend/model/env.aon` as `own_kv_id` (or `voxgig_kv_id`), then
regenerate the config:

```bash
cd backend && npm run model-build && cd ..
grep -A2 'env.own.kv_namespaces' $C      # the new id must be here
```

Never edit `$C` by hand: model-build rewrites it.

## 3. Deploy

```bash
npm run deploy:own       # the voxgig target is: npm run deploy
```

The output names the Worker, the `AGENDA` binding with your namespace id, and the URL.

Always deploy through these scripts. A bare `wrangler deploy` uses the top-level config, whose
namespace id is the local placeholder `agenda-local`, and Cloudflare refuses it:
`KV namespace 'agenda-local' is not valid [code: 10042]`. That refusal is deliberate.

## 4. Seed the agenda by hand

**This step is temporary.** Nothing writes a published snapshot into KV yet. Until the KV write
path change lands, the NodeConf EU 2026 programme is put there by hand. It is a finished,
already-public programme, and its snapshot carries no speaker email.

```bash
node backend/bin/conf-agenda.mjs publish backend/test/fixtures/nodeconf/nodeconf.json --json \
  > /tmp/nodeconf.json
truncate -s -1 /tmp/nodeconf.json    # drop console.log's trailing newline: KV holds the exact bytes

wrangler kv key put --remote --env own --binding AGENDA --config $C \
  "org_nearform:nodeconf-eu-2026" --path /tmp/nodeconf.json
```

The key is `<org_id>:<slug>`, the same one `cag/snapshot` uses. A new key can take up to a minute
to be visible at every edge location.

## 5. Smoke it

```bash
node backend/tool/edge-smoke.mjs https://conf-agenda-own.jose-perigolo.workers.dev \
  --expect /tmp/nodeconf.json
```

It checks that an unpublished slug answers `404 not-published`, an off-route path answers `404`,
and nothing redirects (an Access login in front of `/agenda/*` would). With `--expect`, it also
checks that the agenda comes back byte for byte, the `.ics` and `.csv` feeds are served inline,
and the TTFB median is under SPEC §17's 200ms. It exits 1 if any check fails.

Without `--expect`, only the first three checks run. That is the form to use before anything is
seeded.

## Undo

| To | Run |
|---|---|
| Go back to the previous version | `wrangler rollback --env own --config $C` |
| Stop serving the agenda, keep the Worker | `wrangler kv key delete --remote --env own --binding AGENDA --config $C "org_nearform:nodeconf-eu-2026"` |
| Remove the scratch Worker | `wrangler delete --env own --config $C` |

Deleting the key needs no redeploy: the Worker answers `not-published` on the next request.
