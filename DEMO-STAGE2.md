# Demo runbook — Stage 2, five minutes

**What changed since the Stage 1 demo.** Last time the answer to "can I edit it?" was *no, that's
Stage 2*. This is Stage 2. Five minutes, four things, no architecture diagrams.

The line to open on:

> **Last time I showed you a programme you could look at. This time you can change it — and the
> calendar knows what you changed.**

---

## Before you start

```bash
cd ~/conf-agenda/backend && npm run build && npm run web
```

Open **`http://172.18.117.226:50500/`** — check the IP first, it moves when WSL restarts:
`hostname -I | awk '{print $1}'`. Sign in as `alice@example.com` / `alice-pass-01`.

Click **Fixture**, then click the grid once so it has keyboard focus. It opens on **Tiny Conf
2027**, which has a deliberate room clash — that is on purpose and you will use it.

---

## 1 · The grid edits (2 min)

Focus a session with **`j`** / **`k`**, then:

| | |
|---|---|
| **`Shift-→`** | move it to the next room |
| **`Shift-↓`** | move it half an hour later |
| **drag a card** | the same thing with a pointer |
| **`u`** | undo |

Do a move and let them watch the card land. Point at the toast:

> "It tells you *what* it moved and where to. Not 'Saved'. And `u` puts it back."

Then say the one thing worth saying about how it works:

> "Dragging doesn't send a row to the server. It sends **'move this session to that room'** — a
> named instruction. The server decides what that means. So undo isn't a snapshot rewind, it's
> just the opposite instruction, and everything downstream sees an ordinary edit."

**`n`** makes a new session, **`d`** duplicates one with its speakers, **`t`** cycles
draft → confirmed → cancelled.

Press **`?`** for the full list. Worth one line:

> "That list is generated from the same place the keys are handled, so it can't tell you about a
> key that doesn't exist."

## 2 · It tells you when you've broken it (1 min)

Tiny Conf already has one error when it opens — that is deliberate, and the header says so.

Now move a session **onto a slot that's already occupied**. It lands — and:

- both cards go red
- the header count goes up

> "It let me do it. Validation blocks **publishing**, not editing — if you're rebuilding a
> schedule the night before, you need to be allowed to pass through a mess."

Press **`v`** for the panel: the rule name, both sides of the clash, and what to do about it.
Press **`Enter`** on a diagnostic to jump to the session.

> "Publish is blocked while errors remain, and it says so rather than letting you find out."

Press **`u`** a couple of times to put it back.

## 3 · The admin edits too (30 sec)

Click **Speaker** in the sidebar. **New**, **Edit** and **Delete** work now — they were greyed out
last time.

Open the **⋯** menu on a row and press **Delete**. It arms and says *"Delete — confirm"*.

> "One click with no undo on every row isn't a thing to ship."

Then go to **Room** and try to delete one that's in use. It refuses and names what's holding it.

## 4 · One room change, one calendar update (1 min)

**This is the point of the whole thing.** Switch to **Demo Conf 2027** in the picker. Move
**"Ejectable Embeds"** into another room, then press **`S`**.

Three rows have something to say, and one grey row has nothing — which is the one that matters.

| | |
|---|---|
| **Ejectable Embeds** | `update · same UID, seq+1` — *room* |
| Undo as a Contract | `cancel event · tombstone` |
| Workshop — Aontu in Anger | `update` — *attendee set* |
| **5 further segments** | **hash unchanged · no-op · zero provider calls** |

> "I changed one room. That's **one update** to the people on that session — it edits the entry
> already in their calendar rather than sending them a second invitation. The other two rows were
> already there: something got cancelled, and a workshop picked up a co-mentor. And everything
> else costs **nothing** — not 'we filtered them out', *zero API calls*."

Then the closing line:

> "Sending invitations is easy. Never sending a duplicate is the product."

That is the whole thing in one screen.

---

## The API change, if they ask (30 sec)

> "Every edit is its own named message — `move:segment`, `set:status`, `add:appearance`. There's no
> generic 'save this record' endpoint, on purpose: that's the shape that lets a caller change
> anything, and it's how you end up writing to the wrong customer's data."

If they want one more: there's a read-only agent tool now that can search a published programme —
"find me the sessions about observability" — and it can't see a draft, a private session or a
speaker's email address, because it reads the published snapshot and nothing else.

## Do not demo these

- **Sending real invitations.** The whole calendar path works and nothing leaves the machine —
  there's no deliverer registered, on purpose.
- **Google Calendar.** Not built. `.ics` is, and it's the always-available one.
- **The public agenda page.** Still the Stage 1 landing page; the per-conference public page is next.

## If something goes wrong

| | |
|---|---|
| Blank page | wrong IP — `hostname -I` |
| Grid ignores keys | click the grid once; it needs focus |
| A move seems stuck | it's optimistic then reconciles — give it a second, the toast is the confirmation |
