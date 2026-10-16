# ConfAgenda - cloudflare environment (starting point)

    cd gen/env/cloudflare && npx wrangler deploy

The worker entry (src/env/cloudflare/worker.ts - yours to edit, wrangler
bundles the TS directly) is a 501 stub: wire the Seneca gateway into the
fetch handler (src/env/lambda/lambda.ts is the AWS model to follow).