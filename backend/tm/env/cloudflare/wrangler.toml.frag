# $$Name$$ backend - Cloudflare Workers config (generated; starting point)
#
# Shadows @voxgig/build's tm/env/cloudflare/wrangler.toml.frag, which emits
# no KV namespace binding. gen/env/cloudflare/wrangler.toml is rewritten by
# every model-build, so the binding is declared in model/env.aon (kv_binding,
# kv_id) and rendered here rather than hand-added to the generated file.
# The name must match the dashboard Worker exactly (cloudflare-workers-
# deployment.md 3.6). It is `conf-agenda`: a mismatch makes Workers Builds
# override it and offer a PR to "fix" the config.
name = "$$name$$"
main = "../../../src/env/cloudflare/worker.ts"
compatibility_date = "2026-01-01"

[vars]
NODE_ENV = "production"

# The published agenda snapshots, keyed org_id:slug (see publish_fixture.ts).
[[kv_namespaces]]
binding = "$$kv_binding$$"
id = "$$kv_id$$"

# Deploy targets, one per Cloudflare account. A deploy names one with
# --env (the root deploy scripts do); a bare deploy uses the top level above,
# whose placeholder namespace Cloudflare refuses at upload.
#
# [vars] and kv_namespaces are not inherited by an environment, so each
# restates them. `name` is stated too: without it wrangler appends the env
# name, and voxgig must deploy as the dashboard Worker's exact name (3.6).

# Jose's account: a scratch Worker on workers.dev.
[env.own]
name = "$$name$$-own"
account_id = "$$own_account_id$$"

[env.own.vars]
NODE_ENV = "production"

[[env.own.kv_namespaces]]
binding = "$$kv_binding$$"
id = "$$own_kv_id$$"

# The voxgig account: the product, agenda.voxgig.com.
[env.voxgig]
name = "$$name$$"
account_id = "$$voxgig_account_id$$"
# The dashboard has workers.dev disabled on this Worker; keep it that way.
workers_dev = false

[env.voxgig.vars]
NODE_ENV = "production"

[[env.voxgig.kv_namespaces]]
binding = "$$kv_binding$$"
id = "$$voxgig_kv_id$$"

# A Custom Domain, not a route, as the dashboard shows it. Declared here so a
# deploy keeps it attached rather than relying on dashboard state.
[[env.voxgig.routes]]
pattern = "$$voxgig_domain$$"
custom_domain = true
