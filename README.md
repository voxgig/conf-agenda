# conf-agenda

Conference agenda platform: keyboard-first SaaS, ejectable embed, multi-calendar speaker invitations.

Build a conference programme once, and publish it everywhere — your own site, calendar feeds, and
your speakers' calendars, where a room change at 22:00 arrives as an *update*, never as a second
invitation.

**Stage 1 (walking skeleton) is built.** The app grid, validation, the published snapshot, the
public read path, the embed, the `.ics`/`.csv` feeds, the CLI and the MCP tool all run locally.

```bash
cd backend && npm install && npm run build && npm test && npm run web   # :50500
```

Sign in as `alice@example.com` / `alice-pass-01`.

## Ejection

An organiser can leave and take a working agenda with them (SPEC §12). From `backend/`:

```bash
node bin/conf-agenda.mjs eject <fixture.json> --out ./agenda                    # snapshot
node bin/conf-agenda.mjs eject <fixture.json> --out ./agenda --mode detached    # + the backend
```

`snapshot` writes `index.html`, `conf-agenda.js`, `agenda.json`, `agenda.ics`, `agenda.csv`,
`assets/`, `README.md` and `LICENSE`. Open `index.html` from disk and it works, with no request
leaving the page.

`detached` puts those same eight entries under `site/` and adds `backend/`: the compiled local
runner and CLI, plus the conference's rows as `backend/fixture.json` with speaker emails removed,
so the organiser can keep editing on their own Node.js. **The two directories are separate on
purpose.** The fixture is the editable programme, so it holds the draft and private sessions the
published agenda withholds; `site/` is the only thing to host, and "upload `site/`" cannot publish
them by accident the way a warning next to `index.html` could.

The conference must have published first; eject never publishes on anyone's behalf. Every asset
is copied into `assets/`, or the eject refuses and names the one it could not get. The same
operation is the `aim:cag,eject:fixture` message, which returns the bundle as data.

| | |
|---|---|
| [HANDOFF.md](HANDOFF.md) | **Start here.** Where the project is, what is next, and the traps that have already cost time |
| [DEMO.md](DEMO.md) | How to show it — seven minutes, six surfaces, and what to say when asked |
| [docs/tutorial.md](docs/tutorial.md) | Start here to work on it |
| [docs/decisions/](docs/decisions/README.md) | Why things are the way they are |
| [AGENTS.md](AGENTS.md) | Conventions, for humans and assistants alike |

MIT.
