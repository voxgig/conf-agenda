# $$Name$$ backend - Cloudflare Workers config (generated; starting point)
#
# Shadows @voxgig/build's tm/env/cloudflare/wrangler.toml.frag, which emits
# no KV namespace binding. gen/env/cloudflare/wrangler.toml is rewritten by
# every model-build, so the binding is declared in model/env.aon (kv_binding,
# kv_id) and rendered here rather than hand-added to the generated file.
name = "$$name$$-backend"
main = "../../../src/env/cloudflare/worker.ts"
compatibility_date = "2026-01-01"

[vars]
NODE_ENV = "production"

# The published agenda snapshots, keyed org_id:slug (see publish_fixture.ts).
[[kv_namespaces]]
binding = "$$kv_binding$$"
id = "$$kv_id$$"
