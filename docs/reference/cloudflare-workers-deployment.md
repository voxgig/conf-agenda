# Cloudflare Workers deployment: known failure modes

*Diátaxis: reference. Companion to `docs/decisions/cloudflare-spike.md`, which decided that Seneca
4 runs on Workers. This is the list of things that go wrong on the way.*

**Source: Rafael Godoy, 2026-10-14**, from deploying a Seneca + Durable Objects + static assets
monorepo through the Workers Builds git integration. Rafael is the author of
`Rarfael/night-sky-logbook`, the live Seneca-on-Workers deployment the spike called "the decisive
prior art", and the person `cloudflare-spike.md`'s recommendation 6 said to talk to before starting.
This file is the answer to that recommendation, so read it before writing any Worker here.

Each entry is SYMPTOM / CAUSE / FIX. Sections 1 and 5 are Seneca-specific and do not apply to a
Worker with no Seneca in it, which is what §19.6's first slice ships. The rest applies to any
Workers deployment, including ours.

---

## 0 · The three that cost the most time

**A plain member role silently hides everything.** `Settings -> Builds` is invisible and build
history reads "No builds exist yet", which is *identical to having no integration at all*. Get
Admin on the Cloudflare account before diagnosing anything.

> **This explains our own red check.** `HANDOFF.md` recorded `Workers Builds: conf-agenda` failing
> in 0 seconds with no log and inferred "there is nothing to build". That inference was reasonable
> and may still be partly true, but it is not established: a member-role account produces exactly
> the same symptoms. Re-check it now that Richard has granted Admin.

**`wrangler deploy --dry-run` cannot catch upload-validation errors.** It bundles but never
uploads, so Cloudflare never executes the script, and a bug that fails validation passes every
dry-run. The same caveat applies to `wrangler dev --local`: it proves the bundle runs, not that it
deploys. To test for real without touching production, deploy to a throwaway Worker:

```bash
CLOUDFLARE_ACCOUNT_ID=<other> npx wrangler deploy --name scratch-test
```

**(Seneca) A throw during plugin init hangs the Durable Object forever.** Not an error, not a
rejection: silence. See 1.1.

## 1 · Seneca runtime under workerd

*Not applicable to a Worker with no Seneca. Load-bearing for the app and API path.*

**1.1 A throw during plugin init hangs the whole DO.** Every request times out with no status.
An exception thrown synchronously during Seneca's plugin-init pass inside `seneca.ready()` is not
surfaced as a rejection under workerd and hangs the DO permanently, for all messages. Never throw
during plugin init; return a stub action that reports failure as a value:

```js
// Instead of: throw new Error(`no handler for ${actpath}`)
return async function notSupported() {
  return { ok: false, why: `${actpath} is not available on this platform` }
}
```

A DO with an in-flight request can survive a redeploy for up to ~15 minutes, so a hung instance may
persist after the fix is pushed.

**1.2 `@seneca/user`'s password hasher forks a child process.** `seneca.ready()` never resolves, no
error. The default hasher calls `ChildProcess.fork()`, unsupported on workerd. Fix: `user: { fork:
false }`, which runs the identical salted and peppered SHA-512 inline. The fork exists only to keep
hashing off the event loop, so this is not a security downgrade. Needs `senecajs/seneca-user` PR
**#122** if unreleased.

> **We depend on this.** `backend/package.json` pins `@seneca/user` 6.4.0.

**1.3 Dynamic `require()` cannot be bundled.** `@seneca/reload`'s `make()` performs a computed
`require(actpath)` that esbuild cannot statically resolve. Fix: an explicit map of literal requires.

```js
const handlers = { './list_item': require('../../srv/inbox/list_item') }
```

> **This is the handler-map problem**, and Rafael adds an argument the spike did not: the map is
> also the boundary that keeps Node-only code (`child_process`, `fs`) out of the bundle. Omit a
> file and it cannot be reached. For conf-agenda the map should be **generated from the model**,
> which `backend/build/` is already the place for.

**1.4 Required Seneca options.** `Seneca({ debug: { undead: true } })` to survive a bundled
isolate, and `seneca.use(PluginRef)` with a function reference, **never** a string name.

**1.5 `process.env` is not populated from bindings.** `nodejs_compat` provides the global but does
not fill it. Backfill explicitly in the DO constructor for any var service code reads directly.

**1.6 The auth cookie name must match in two places.** Signin appears to succeed and every
subsequent request is anonymous, with no error: the gateway plugin writes the cookie, the auth
plugin reads it, and their defaults differ. Set the same `auth.token.name` in both.

**1.7 `require: true` on the auth gate locks you out.** `user: { require: true }` has no per-message
exclusion, so it 401s the signin message itself. Use `require: false` plus a gate hook that lets
the auth messages through.

## 2 · Bundling

**2.1 A package with a `browser` field gets the browser build,** and it fails **at deploy, never at
dry-run**: `Uncaught ReferenceError: window is not defined`, code 10021. esbuild honours `browser`
when bundling for Workers, and Cloudflare validates an upload by executing it. Fix: pin the node
entry through wrangler's `alias`, using a bare package subpath rather than a relative
`node_modules` path so it does not depend on hoisting.

```json
{ "alias": { "@hapi/joi": "@hapi/joi/lib/index.js" } }
```

Any dependency with a `browser` field is a candidate. Reaching `joi` via `optioner` then `seneca`
is the common path.

**2.2 Code depending on gitignored build artifacts** resolves on any machine that has run the test
suite and fails only in CI or a clean checkout. esbuild cannot prove a runtime-env-var branch is
dead, so it resolves every branch's `require()` whether or not it executes. Move anything a deploy
needs into committed source.

## 3 · Workers Builds (the git integration)

**3.1 Everything is invisible without Admin.** See §0.

**3.2 A rolled or deleted build token** dies at `Initializing` with "The build token selected for
this build has been deleted or rolled". Pick or create a new one under Settings -> Builds.

**3.3 No lockfile means Cloudflare picks bun, not npm.** The build image detects both and runs `bun
install`. Bun does not parse npm's `--workspace=` the same way, and silently skips lifecycle scripts
for untrusted dependencies, breaking any `github:` dependency with a `prepare: tsc` step. Fix:
commit a root `package-lock.json` generated by a real `npm install`.

> **Live in this repo.** The root `package.json` is tooling-only (it pins the openspec CLI) and
> there is **no root `package-lock.json`**, so a Workers build here would use bun today.

**3.4 The dashboard's command fields call npm scripts you may not have**, failing with `npm error
Missing script: "build"`. Keep the real wrangler invocation in the repo rather than a dashboard
field, so it is version-controlled. There are **three** fields: Build command and Deploy command
run for the production branch, Version command for non-production branches.

> **Live in this repo.** The root `package.json` has only an `openspec` script: no `build`, no
> `deploy`.

**3.5 `versions upload` cannot apply Durable Object migrations,** and it is the Workers Builds
default for non-production branches. The Deploy command must be `npx wrangler deploy`, at least for
the first deploy.

**3.6 The Worker name must match** the name in the wrangler config at the configured Root directory.

**3.7 Monorepos.** Root directory is a dashboard-only field and cannot be set from the repo. If it
cannot be changed, make the repo **root** a valid Workers project: a root wrangler config with
paths relative to root, plus npm workspaces so one root install resolves every subproject.

> **Relevant to us.** Our wrangler config is generated at
> `backend/gen/env/cloudflare/wrangler.toml`, and the repo root is deliberately *not* an npm
> workspace. Settle Root directory before connecting the integration.

**3.8 GitHub Actions**, if used instead, may require every action pinned to a full-length commit
SHA, with the version as a trailing comment.

## 4 · Secrets and configuration

**4.1 Secrets, never `vars`.** `wrangler.json` `vars` are committed plaintext.

```bash
CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler secret put MY_TOKEN --name <worker>
```

The command takes only the **name**, then prompts for the value separately. **Pasting
`MY_TOKEN=value` at the prompt stores the whole string as the secret name, and names are not
secret, so that leaks the value.** Revoke and redo. Secrets are write-only: `wrangler secret list`
shows names only, so keep the value in a password manager, because otherwise rotation is the only
recovery. Secrets survive deploys.

**4.2 `secret put` fails if the latest version is not deployed**, because branch builds uploaded
versions that were never deployed. Deploy first, then set the secret, or use `wrangler versions
secret put`.

**4.3 Environment variables are capped at 5 KB each**, on Free and Paid, rejected with error 10054.
A long generated list cannot be an env var; move it to storage or derive it at runtime.

## 5 · Calling external APIs from a Worker

*Not applicable to the read path, which calls nothing.*

**5.1 Workers' `fetch` sends no `User-Agent`.** GitHub then returns plain text, not JSON, and the
symptom is a JSON parse error on `Request forbidden by administrative rules`. Node's fetch sets one
by default and Workers' does not, so this works locally and fails only once deployed.

**5.2 404 against 401 when debugging API auth.** An invalid token returns 401. A valid token lacking
permission returns **404**, because GitHub hides existence. So 404 on everything means a valid
token with the wrong scopes.

**5.3 Parameter-name drift between a real provider and a test fixture** passes every test and fails
live. Fix: run one contract suite unchanged against both the fixture and the real provider. Two
bugs in one week came from this gap.

**5.4 Return failures as values, do not throw.** One unreachable resource produced a 500 for an
entire page, because callers were written expecting a value.

## 6 · Architecture constraints

**6.1 Durable Objects are single-threaded.** One long operation blocks every other request to that
object. Use `Promise.allSettled` for anything parallel against a DO, so one slow call cannot take
down the rest.

**6.2 Subrequest limits: 50 per invocation on Free, 10,000 on Paid** (configurable to 10M via
`limits.subrequests`). Never build a response by calling an external API once per item. Sync into
storage on a schedule and serve reads from storage.

**6.3 DO storage persists, in-memory state does not.** A deploy restarts the instance; storage
survives. Deleting the Worker destroys storage. Renaming a DO class requires a migration.

**6.4 Cloudflare Access blocks all automated access,** returning a 302 to SSO for `curl` and CLI
tools. Options: an Access bypass policy scoped to one path, service tokens, or the `workers.dev`
subdomain.

**6.5 Account selection.** With access to multiple accounts wrangler refuses to guess, so set
`CLOUDFLARE_ACCOUNT_ID`. wrangler tokens snapshot permissions at issuance: **after being added to
an account or given a new role, `wrangler logout && wrangler login`**, or the change is invisible.
wrangler's OAuth token has no Workers Builds API scope, so build logs and build config cannot be
read from the CLI at all.

**6.6 Debugging production.**

```bash
CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler tail <worker> --format json
```

Works whether or not the Observability toggle is on. Output is pretty-printed JSON objects, so
parse the stream rather than line by line.
