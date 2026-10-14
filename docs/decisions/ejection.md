# Ejection: why the bundle is shaped as it is

SPEC §12 promises an organiser can leave with a working agenda: open `index.html` from a
`file://` URL and it works, with no network. Two findings shaped how that promise is kept, and
both outlive the change that built it (`openspec/changes/eject-conference`).

## A `file://` page can load neither a module script nor `fetch`

Chromium treats a `file://` page as an opaque origin. Two things follow, and both were measured,
not assumed:

- **A module script does not load.** `<script type="module" src="./conf-agenda.mjs">` is fetched
  under CORS, and an opaque origin cannot pass CORS, so the component never runs. No network is
  involved; the file is right there. A classic `<script src>` has no such restriction.
- **`fetch()` is blocked.** So `<conf-agenda src="./agenda.json">`, the component's only data path
  until this change, cannot read a file sitting next to the page.

That is why the bundle:

1. ships the embed's **UMD** build (`embed/dist/conf-agenda.umd.cjs`) as `conf-agenda.js`, loaded
   with a plain `<script>`. `backend/tool/copy-embed.mjs` copies that file and never the `.mjs`.
   Shipping the `.mjs` would pass every unit test and fail the one thing §12 promises.
2. **inlines the agenda** into `index.html` and hands it to the component's `.agenda` property,
   which the component gained for this. `agenda.json` is still written as its own file, for hosting
   over http and for whatever reads the feeds; the inline copy is what makes `file://` work.

`web/e2e/eject-offline.spec.js` is the proof: it opens the ejected `index.html` as a `file://` URL
with every request aborted, and asserts the agenda renders and a session opens. Its first bite
check was shipping the `.mjs` as `conf-agenda.js`, which fails exactly as described above.

## The real remote-asset download is untested here

Vendoring copies every asset the agenda references into `assets/`. A remote one is downloaded
at eject time. On this machine **node's outbound network is blocked** while `curl` works (the same
cause as the npm registry trap in `HANDOFF.md`): a plain node HTTPS request to `example.com` times
out. So the download half has never run against a real host.

What is proven instead:

- `vendorAssets` (`backend/src/lib/eject/assets.ts`) takes its fetcher as an argument. The unit
  tests drive it with a recording fake, the pattern the calendar providers use, covering a fetched
  asset, a failed fetch that refuses and names the URL, and a symlink escaping the assets root.
- `eject_fixture.ts` defaults the fetcher to global `fetch`, so a real eject uses node's own client
  with no wrapper of ours in between.

What is not: a real HTTP response (redirects, content types, a slow host) passing through it. This
is a known untested edge, recorded rather than pretended. The first eject run on a machine with
egress should vendor a conference with a remote photo and open the result offline.

## Detached ships a fixture file, not a seeded runner

`detached` puts the snapshot's eight entries under `site/` and adds `backend/`: the compiled local
runner and CLI, the compiled model, the component, and the conference's live rows as
`backend/fixture.json`. The local runner on its own
(`backend/gen/env/local`) is just a script that runs the backend's build, and the runner starts
with an empty in-memory store, so neither is enough to keep editing. The CLI already validates,
publishes and ejects a fixture file without a server, so editing that file and running the shipped
CLI is how an organiser keeps going. That needed no new code path.

Speaker emails are blanked in that fixture, because C6 holds in every mode. The model allows an
empty email, so the file still loads, and validate reports each speaker as `speaker-no-email`, a
warning that does not block publication.

## The hostable files and the data are separate directories

The fixture carries draft and private sessions: a private one never reaches the published snapshot
(`src/lib/agenda.ts:77`), and the whole point of shipping the rows is that the organiser keeps the
ones the public never saw. The first version left `backend/` beside `index.html` with a bold README
line saying not to host it, which is a warning rather than a guard: one `aws s3 sync .` publishes
the drafts.

So the hostable files live under `site/` and nothing else in the bundle is hostable. This repo
already holds that standard elsewhere, which is the argument that settled it: `asset-escapes-root`
exists so a build cannot copy a private file into public output, and containment is judged on the
canonical path after resolving symlinks rather than documented as a rule for authors to follow.
Prose was below the bar the rest of the project keeps.

The README is in both places on purpose. `site/README.md` is the snapshot's, describing the bundle
to whoever is handed it; the root one adds the detached section, where an organiser opening the
directory finds it.
