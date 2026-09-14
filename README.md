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

| | |
|---|---|
| [DEMO.md](DEMO.md) | How to show it — seven minutes, six surfaces, and what to say when asked |
| [docs/tutorial.md](docs/tutorial.md) | Start here to work on it |
| [docs/decisions/](docs/decisions/README.md) | Why things are the way they are |
| [AGENTS.md](AGENTS.md) | Conventions, for humans and assistants alike |

MIT.
