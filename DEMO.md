# Demo runbook

**Stage 1, the walking skeleton.** Nine minutes: the six screens in the sidebar, then the six
things that come out of them. Everything below is real and runs locally — nothing is mocked for
the demo, and the one thing that is deliberately broken stays broken because that is the point of
it.

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

**Both ports move together.** The backend is `:50500` and the embed page is `:50600`; if one needs
the WSL IP, so does the other. The demo page handles this itself — it rewrites the backend host to
match whichever host you reached *it* on, so the embed is not left pointing at a `127.0.0.1` that
means Windows' own loopback to a browser running on Windows.

Whichever you use, **open both pages in the browser before the audience is watching**. A blank page
at minute one costs you the room.

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

…or the same two over the WSL IP — `http://172.18.117.226:50500/` and
`http://172.18.117.226:50600/test/live` — if you have not set `networkingMode=mirrored`.

Sign in as `alice@example.com` / `alice-pass-01`.

---

## The nine minutes

Signed in, the sidebar has six items, alphabetical:

> **Appearance · Fixture · Room · Snapshot · Speaker · Track**

Walk them top to bottom. Five of the six screens were **not written** — they are generated from
the model, which is the first thing worth saying out loud:

> "I wrote one file describing what a conference *is*. These screens, the REST API, the docs and
> the SDK surface all come out of it. The only screen I hand-built is the agenda grid, because a
> grid is the one thing a generator cannot guess."

### 1 · Appearance — who is on which session (30s)

Columns: fixture, speaker, role, invite, order. 13 rows.

> "The join table. A speaker is not *in* a session — they **appear** on one, with a role
> (speaker, host, panellist, mentor — the seed only uses `speaker`) and an invitation state.
> Separating those is what makes the calendar work: the invitation belongs to the appearance, so
> moving a session updates one entry per person rather than creating a second one."

Point at the **`invite`** column — `none` everywhere today.

> "That column is where Stage 2 lives. It will read `sent`, `accepted`, `declined`."

### 2 · Fixture — the agenda grid (2 min)

**The centrepiece.** This is the one custom screen, and it opens on **Tiny Conf 2027**: rooms
across, time down, a 30-minute ladder, four sessions.

First, what a fixture *is* — this is the idea the whole product rests on:

> "There is no conference table, no day table, no session table. There is **one recursive
> entity**. A conference is a fixture; a day is a fixture inside it; a talk is a fixture inside
> that. A workshop that contains three exercises is the same shape again, for free."

> "That is why there is no 'day' in the sidebar. A day is either a grouping the grid derives from
> local dates, or just another fixture. Ask an assistant for a conference data model and it will
> confidently hand you conference → day → session, three tables. That tower is exactly what this
> rejects."

Then drive it from the keyboard, because that is the product's claim:

| | |
|---|---|
| **`j` / `k`** | move between sessions |
| **`Enter`** | open the detail panel |
| **`?`** | the shortcut list |
| **`Cmd-K`** / **`Ctrl-K`** | the command bar, then `g` for the first session |

> "Every action is a key. PLATFORM §5.2 — `j`/`k`/`Enter` mean the same thing in both of our apps,
> so you learn the vocabulary once."

Now point at the **crimson-tinted cell**: two sessions in one room at one time, stacked in the
same cell rather than one quietly hiding the other.

> "That is a room double-booking, and it is *rendered* rather than swallowed. An earlier version
> of this grid skipped the covered slot and the second session vanished — the bug hid exactly the
> thing the product exists to find."

One more, if they are paying attention: the keynote ends at 10:00 and the next session starts at
10:00, same room, and that is **not** flagged.

> "Half-open intervals. Touching is not overlapping. Get that wrong and the product emails every
> speaker about a collision that does not exist."

**Say it is read-only.** Editing is Stage 2. Do not let anyone discover that by dragging.

**If someone asks for the two-day conference:** the grid opens the first conference by id and
there is no picker yet. The message already takes one (`aim:web,on:cag,load:tree` with a
`fixture_id`, and it returns the list of conferences) — only the control is missing. The two-day
programme is what the embed, the feeds and the agent tool are all showing later in this demo, so
it is two minutes away rather than absent.

### 3 · Room — where things happen (20s)

Columns: name, capacity, floor, accessibility, order. 5 rows across both conferences.

> "Rooms are the grid's columns — `order` is literally the column order."

Capacity earns its place: Main Hall 400, Studio 120, Workshop Lab 40. The `over-capacity` warning
reads it and names both numbers — *"… expects 60 people in a room that holds 40."* It stays quiet
in this demo, because none of the seeded sessions carries an expected headcount; the rule is built,
the data to trigger it is not.

### 4 · Snapshot — the published artefact (45s)

**One row.** That is the beat — there are two conferences seeded, and only one snapshot.

> "Tiny Conf has a room clash, so it did not publish. Not 'published with a warning' — it does
> not exist on the public side at all."

Then what a snapshot is:

> "Everything public reads *this*: the public page, the embed, the feeds, the agent tool. Nothing
> public ever touches the live rows. That is what makes the read path fast, cacheable, safe by
> construction — and ejectable."

Point at **`agenda_json`** and say it is a **string**, not an object:

> "It is stored as bytes, because `agenda.json` has to be byte-identical for identical input. An
> object round-tripped through a store can come back with a different key order, and that changes
> the content hash — which is how the sync engine decides whether to re-send an invitation. Key
> order deciding whether a speaker gets a duplicate invite is not a hypothetical."

Also worth a sentence: `published_at` is a column here, deliberately **outside** the payload, for
the same reason.

### 5 · Speaker — people, not roles (20s)

Columns: name, email, bio, organisation, site. 8 rows.

> "Speakers are scoped to the **organisation**, not to the conference. Someone who spoke in 2026
> and again in 2027 is one person with one bio — not two rows to keep in step."

If someone spots Ada Byrne twice: those are two different *organisations* (`org_tiny` and
`org_demo`), which is the scoping working, not failing. Within one org she would be one row.

Point at the **email** column being visible here:

> "The admin can see it; the public never does. Not filtered out on the way to the public — the
> public shape is *built* field by field and no email key exists in it. And the admin has to see
> it, otherwise the warning 'this speaker has no email, they cannot be invited' is unactionable."

### 6 · Track — the organiser's colours (20s)

Columns: name, colour, description, order. 4 rows.

> "Tracks are the agenda's threads, and the colour is **organiser data, not theme**. That
> distinction is the interesting part: because the colour is data, it can be checked. A track
> colour has to pass WCAG AA contrast against the app's foreground and background in **both**
> light and dark — a colour that only works in one mode fails half the audience."

**Be accurate about this one:** the theme tokens are in place and the rule is specified
(`bad-color-contrast`, SPEC §16.1), but it is **not built yet** — it lands with the rest of the
§16.1 set in Stage 2. Say "that is the next rule I am writing", not "it catches it".

---

Then leave the sidebar. **Steps 1-6 were the model; steps 7-12 are what comes out of it** - the
same agenda as a refusal to publish, a public URL, an embed on someone else's site, a calendar
feed, and an answer to an agent.

### 7 · Validation refuses to publish (60s)

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
3. **One error, not two.** The touching pair you pointed at in the grid is absent from this
   output, and that silence is the assertion — the fixture pins it, so a change that starts
   calling it a clash fails the suite rather than emailing every speaker.

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

### 8 · The public path serves nothing it should not (45s)

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

### 9 · The embed on someone else's site (60s)

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

### 10 · The calendar feed (45s)

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

### 11 · The agent tool (45s)

```bash
CONF_AGENDA_FIXTURE=test/fixtures/demo/demo.json npm run mcp
```

An MCP server over stdio with one tool, `conf_agenda_agenda`.

> "Agents are a first-class client, not an afterthought — same message the embed posts, so an agent
> sees exactly what the public sees. And it is **read-only by policy**: an agent that can move a
> session can email a speaker. Write tools need an explicit per-org opt-in, and sending invitations
> is never one of them — that stays a human confirmation."

If you would rather not run a stdio server live, say the sentence and skip the command.

### 12 · Close on the model (45s)

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
- **Switching conferences in the grid.** No picker — it opens the first by id (Tiny Conf). The
  message takes a `fixture_id` already; the control is not built.
- **Cloudflare.** The spike says it works (`docs/decisions/cloudflare-spike.md`); nothing is
  deployed. Stage 4.

---

## If it breaks

| Symptom | Cause | Fix |
|---|---|---|
| Connection refused from Windows, on either port | WSL2 localhost forwarding — the servers are fine, check with `curl` inside WSL | `networkingMode=mirrored`, or use the WSL IP for **both** ports |
| Embed page loads but the agenda is empty | The browser cannot reach the backend host in `src` | Reach the page over the same host as the backend; the page rewrites it for you |
| App loads, grid is empty | Seed only runs into an empty store | Restart `npm run web` |
| `not-allowed` in the browser console | A service's messages are not declared in `srv.aon`'s `in:` block | An undeclared service registers nothing and logs no error — check the declaration, not permissions |
| Embed shows nothing | Backend not running, or CORS | The `/agenda/...` routes send `Access-Control-Allow-Origin: *`; check the backend first |
| Embed unreadable on a light page | Old build | `cd embed && npm run build` — fixed in the theme commit |

**Rehearse the first sixty seconds.** Sign-in, Fixture, `j` `j` `Enter`. That is the whole demo's
credibility, and it is the part most likely to be embarrassed by a cold cache.

---

## The sidebar, on one card

Print this bit if you want something to glance at.

| Screen | In one line | The point to make |
|---|---|---|
| **Appearance** | speaker × session, with role and invite state | the invitation belongs here, which is how a move updates instead of duplicating |
| **Fixture** | the agenda grid — and every conference, day and talk | **one recursive entity**, no conference/day/session tower |
| **Room** | the grid's columns | `order` is the column order; capacity feeds the `over-capacity` warning |
| **Snapshot** | the published artefact | one row for two conferences — the broken one does not exist publicly |
| **Speaker** | people, scoped to the org | one bio across editions; email visible here, never public |
| **Track** | the organiser's colours | colour is data, so it *can* be contrast-checked — rule is Stage 2 |

Five of those six screens are generated. The grid is the only one hand-built.
