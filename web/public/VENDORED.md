# Vendored browser bundles

`seneca-browser-store.js` and `seneca-browser-debug.js` are **copied from
`metsitaba/todo-app@main:frontend/public/`**, verbatim.

`@voxgig/seneca-browser-store` and `@voxgig/seneca-browser-debug` — which the generated
`web/package.json` asked for — are **not published** (404 on npm, checked 2026-09-13). That is the
dependency PLATFORM.md §3.1 records as *"exists, unpublished — extract and publish"*, owned by the
repo-manager developer.

PLATFORM.md §19.2 prescribes exactly this fallback:

> If the published package is late, vendor todo-app's working `seneca-browser-store.js` exactly as
> todo-app does — the same code the package will contain, so the migration is a script tag becoming
> a dependency.

And §9.5's escape hatches put "vendor a local copy" third, with the instruction to mark it:

<!-- VENDORED: @seneca/browser-store — remove when published, at Stage 2 -->

**To remove:** when `@seneca/browser-store` publishes (1.0.0 per §3.1), delete these two files, add
the dependency, and restore the copy step in `postinstall`. Nothing else should need to change —
the store's API is frozen and todo-app already runs this exact code.
