# Project generation templates

Fragments in this folder shadow the defaults shipped by `@voxgig/build`
(`tm/lambda/*.frag`). Generation templates resolve in layers - first
hit wins:

1. `../src/gen/<name>.ts` - compiled generator override (deep custom)
2. `./<name>.frag` - project fragment (text-level custom, no compile)
3. `@voxgig/build` defaults

Workflow:

```bash
npx voxgig-system template list            # what exists, who provides it
npx voxgig-system template eject srv.yml.frag
# edit the fragment ($$slot$$ placeholders), then:
npm run model-build
npx voxgig-system template diff            # your copies vs the package
```

For structural changes, eject the generator source instead:

```bash
npx voxgig-system template eject srv_yml --code
# edit src/gen/srv_yml.ts, then:
npm run build && npm run model-build
```

`.ejected.json` records what was ejected from which package version so
`template diff` can flag upstream changes after upgrades.
