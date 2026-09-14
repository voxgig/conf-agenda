# Demo runbook

**Stage 1, the walking skeleton.** Seven minutes, six surfaces, one model. Everything below is real
and runs locally — nothing is mocked for the demo, and the one thing that is deliberately broken
stays broken because that is the point of it.

The line to open and close on:

> **One agenda, many outputs.** The app, the public page, the embed, the calendar feed, the CLI and
> the agent tool are all reading the same thing. Not kept in sync — *the same thing.*

---

## Before you start

### 1. Reach the app from Windows

WSL2 does not forward `localhost` on this machine. Fix it once:

```ini
# C:\Users\José\.wslconfig
[wsl2]
networkingMode=mirrored
```

Then `wsl --shutdown` in PowerShell and reopen. If you would rather not restart before a demo, use
the WSL IP directly — **`http://172.18.117.226:50500/`** — but check it first, because it changes
when WSL restarts:

```bash
hostname -I | awk '{print $1}'
```

Whichever you use, **open the app in the browser before the audience is watching**. A blank page at
minute one costs you the room.

### 2. Start the two things

```bash
cd ~/conf-agenda/backend && npm run build && npm run web    # :50500, seeds both conferences
cd ~/conf-agenda/embed   && npm run build && ./node_modules/.bin/serve -l 50600 .
```

Two terminals — both stay running. Use `./node_modules/.bin/serve` rather than `npx serve`: `npx`
run from anywhere but `embed/` will stop to download a copy, which is not what you want with an
audience watching.

The backend seeds itself from `test/fixtures/` at boot — the same rows the test suite runs on, so
the demo and the tests cannot drift apart. Two conferences:

| | | |
|---|---|---|
| **Demo Conf 2027** | `org_demo` / `demo-conf-2027` | two days, three rooms, three tracks, five speakers, one cancelled session. Validates clean, so it **publishes**. |
| **Tiny Conf 2027** | `org_tiny` / `tiny-conf-2027` | four sessions with a deliberate room clash. **Does not publish** — on purpose. |

### 3. Have these tabs open

1. `http://127.0.0.1:50500/` — the app
2. `http://127.0.0.1:50600/test/live` — the embed on a third-party page (`serve` strips the `.html`)
3. A terminal in `~/conf-agenda/backend`

Sign in as `alice@example.com` / `alice-pass-01`.

---

## The seven minutes

### 1 · The grid (90s)

Sign in, click **Fixture**. Rooms across, time down, 30-minute ladder.

Drive it from the keyboard, because that is the product's claim:

- **`j` / `k`** — move between sessions
- **`Enter`** — open the detail panel
- **`?`** — the shortcut list
- **`Cmd-K`** / **`Ctrl-K`** — the command bar, then `g` for the first session

> "Every action is a key. PLATFORM §5.2 — `j`/`k`/`Enter` mean the same thing in both of our apps,
> so you learn the vocabulary once."

Point at the **crimson-tinted cell** in Tiny Conf: two sessions in one room at one time, shown
stacked in the same cell rather than one quietly hiding the other.

> "That is a room double-booking, and it is rendered rather than swallowed. An earlier version of
> this grid skipped the covered slot and the second session vanished — the bug hid exactly the
> thing the product exists to find."

**Say it is read-only.** Editing is Stage 2. Do not let anyone discover that by dragging.

### 2 · Validation refuses to publish (60s)

```bash
node bin/conf-agenda.mjs validate test/fixtures/tiny/tiny.json; echo "exit=$?"
```

```
ERROR  room-double-booked
       Room A — "Message Buses in the Browser" and "D1 at the Edge" overlap by 30 min.
       fix: Move one session to another room or time, or shorten …
FAIL  conf_tiny: 1 error(s), 3 warning(s)
exit=1
```

Three things to land, in this order:

1. **It names both sides.** SPEC §16 — a diagnostic that says "there is a clash" makes the organiser
   do the search themselves.
2. **It exits 1.** This is a CI gate, not a report. A conference with errors cannot be published by
   anybody, including by accident.
3. **The near-miss is silent.** The keynote ends at 10:00 and the next session starts at 10:00 —
   same room, touching. Half-open intervals, so it is *not* a clash. Get that wrong and the product
   emails every speaker about a collision that does not exist.

Then the clean one:

```bash
node bin/conf-agenda.mjs validate test/fixtures/demo/demo.json; echo "exit=$?"
```

```
WARN   cancelled-holds-room
       "Undo as a Contract" is cancelled but still holds Studio. Free the room?
OK  demo_conf: no errors (34 rows, 1 warning(s))
exit=0
```

> "Warnings inform, errors block. The cancelled session still holds its room — that might be
> deliberate, so it is a question, not a refusal."

### 3 · The public path serves nothing it should not (45s)

```bash
curl -s http://127.0.0.1:50500/agenda/org_tiny/tiny-conf-2027.json
```

```json
{"ok":false,"why":"not-published"}
```

> "The unpublishable conference is not filtered out of the public path — it was **never written
> into** what the public path reads. Everything public reads a frozen snapshot; nothing public ever
> reaches the database."

Then the published one:

```bash
curl -s http://127.0.0.1:50500/agenda/org_demo/demo-conf-2027.json | head -c 400
```

> "No speaker email is in there. Not because a field list strips it on the way out — the public
> shape is *built* field by field and no email key exists in it. A structural exclusion survives
> someone adding a field to the entity; a deny-list does not."

### 4 · The embed on someone else's site (60s)

Open `http://127.0.0.1:50600/test/live` — a plain page with a serif font and a cream
background, deliberately nothing like the app.

> "Two lines of markup. No framework, no build step on their side, no account."

```html
<script type="module" src="/dist/conf-agenda.mjs"></script>
<conf-agenda src="…/agenda/org_demo/demo-conf-2027.json"></conf-agenda>
```

**3.2KB gzipped, against a 30KB budget that CI enforces** — `npm run size` fails the build if it
is exceeded, and it has been a check since the first commit rather than a target retrofitted later.

Two details worth pointing at:

- The cancelled session renders **struck through and keeps its slot**. An attendee who remembers a
  talk needs to see that it was cancelled, not find a hole where it used to be.
- The host page sets `--ca-primary: #e70042` and the embed picks it up. Theming is CSS custom
  properties, so it matches their site without a build.

### 5 · The calendar feed (45s)

```bash
curl -s http://127.0.0.1:50500/agenda/org_demo/demo-conf-2027.ics | head -20
```

Point at `BEGIN:VTIMEZONE` / `TZID:Europe/Dublin` and the `DTSTART;TZID=…` lines.

> "Real timezone blocks, not UTC with the offset baked in. Store an offset and your conference
> drifts an hour when the clocks change."

Then the line that matters most:

```bash
node bin/conf-agenda.mjs feed test/fixtures/demo/demo.json --format ics > /tmp/a.ics
node bin/conf-agenda.mjs feed test/fixtures/demo/demo.json --format ics > /tmp/b.ics
diff /tmp/a.ics /tmp/b.ics && echo "byte-identical"
```

> "Identical input, identical bytes — no wall-clock timestamps, no unsorted keys. That is SPEC §17,
> and it is not tidiness. The sync engine decides whether to re-send an invitation by comparing a
> content hash. One `Date.now()` in the output and every speaker gets a duplicate invitation for a
> change that never happened. The upstream plugin has exactly that bug today, at `Calendar.ts:285`,
> and it is written up in the scope note."

Paste the `.ics` URL into a calendar app if you have one open — it subscribes.

### 6 · The agent tool (45s)

```bash
CONF_AGENDA_FIXTURE=test/fixtures/demo/demo.json npm run mcp
```

An MCP server over stdio with one tool, `conf_agenda_agenda`.

> "Agents are a first-class client, not an afterthought — same message the embed posts, so an agent
> sees exactly what the public sees. And it is **read-only by policy**: an agent that can move a
> session can email a speaker. Write tools need an explicit per-org opt-in, and sending invitations
> is never one of them — that stays a human confirmation."

If you would rather not run a stdio server live, say the sentence and skip the command.

### 7 · Close on the model (45s)

```bash
npm run model-check
```

```
verdict: pass
verdict: pass
aon1-iB6GsrxfZksHYEnOKZLy_unm3kj-TzwqknZ_1P2OrZo
```

> "Everything you just saw — the entity screens, the REST API, the docs, the SDK surface — is
> generated from one model. The `contains` relation is declared acyclic *in the model*, and that
> check runs on every build against the real data, not against the type declarations. The hash is
> the model's fingerprint: it is how the next build knows whether anything breaking changed."

Finish where you started: **one agenda, many outputs.**

---

## What to say when asked

**"Can I edit the grid?"**
Not yet — Stage 2. The move is designed already: dragging emits a named intent (`move:segment`),
never a computed row, and undo runs the message's own declared `inverse` rather than restoring a
snapshot. Stage 1 was deliberately shallow so the shape could be proven cheaply.

**"Does it actually send invitations?"**
Not yet, and that is on purpose. The hard part is not sending — it is **never sending twice**. The
ledger and the reconciliation loop get built against a fake provider that records every call, with
the outbound cap, the redaction and the dedup gate layered above the dispatch, *before* a real
provider exists. Google comes last, once the safety machinery already holds.

**"Why not React?"**
PLATFORM §5.3. The embed goes on other people's sites; a framework would arrive with it. 3.2KB, no
dependencies, works in any page.

**"How much of this is hand-written?"**
The entity screens, the REST API, the docs and the SDK surface are generated. What is hand-written
is what encodes judgement: the validation rules, the tree algebra, the public read path, the ICS
builder. The rule is in the plan — the moment you are hand-writing something the model could
declare, you have left the plan.

**"Is it locked in?"**
No. MIT, self-hostable, and `eject` in Stage 3 hands you a static bundle with no runtime dependency
on the service. It has a test: eject, serve with all outbound network blocked, drive it with a
browser.

---

## Do not demo these

- **Editing the grid.** Read-only. Stage 2.
- **Anything calendar-side.** `plan:sync` returns a plan and sends nothing; there is no provider.
- **The SDK.** Blocked — neither `apidef` nor `sdkgen` bootstraps the `.sdk/` scaffold they both
  require. Written up in `sdk/README.md`.
- **Multi-tenancy as a feature.** Org scoping is real and tested, but there is no self-serve signup
  and no tenant switcher.
- **Cloudflare.** The spike says it works (`docs/decisions/cloudflare-spike.md`); nothing is
  deployed. Stage 4.

---

## If it breaks

| Symptom | Cause | Fix |
|---|---|---|
| Connection refused from Windows | WSL2 localhost forwarding | `networkingMode=mirrored`, or use the WSL IP |
| App loads, grid is empty | Seed only runs into an empty store | Restart `npm run web` |
| `not-allowed` in the browser console | A service's messages are not declared in `srv.aon`'s `in:` block | An undeclared service registers nothing and logs no error — check the declaration, not permissions |
| Embed shows nothing | Backend not running, or CORS | The `/agenda/...` routes send `Access-Control-Allow-Origin: *`; check the backend first |
| Embed unreadable on a light page | Old build | `cd embed && npm run build` — fixed in the theme commit |

**Rehearse the first sixty seconds.** Sign-in, Fixture, `j` `j` `Enter`. That is the whole demo's
credibility, and it is the part most likely to be embarrassed by a cold cache.
