# The sync ledger, and where it lives

**Decided 2026-09-16.** SPEC §10 is emphatic about *what* the ledger must do and mostly silent
about *where the code sits while the upstream plugin catches up*. This records the placement, the
build order, and four things the toolchain forced.

## Where it lives, and why not upstream yet

SPEC §10.1: the work is *"an extension of the upstream plugin, not a new one"* — contributed as PRs
to `senecajs/Calendar` where the maintainers take them, as a companion module where they do not.

`@seneca/calendar` is **not a dependency of this project yet**. It is not on npm, its domain is
time-based maintenance events, and `ctpj_intel_fox` pins it at a commit. Taking the dependency
before the ledger's shape has settled would mean designing against an interface nobody has agreed,
and then carrying a git pin through every change.

So the ledger is built **here first**, in `backend/src/concern/CalendarSync/`, and:

- It answers **`sys:calendar,*`**, not `concern:*`. Those are the patterns §10.2 names, and the
  namespace is what makes the eventual move upstream a *lift* rather than a rename. Every caller
  already posts the pattern it will post when the code lives in the plugin.
- It is loaded like a concern — once, in `env/shared/basic.ts` — so there is **no `aim:` surface**
  and nothing is gateway-reachable. `test/unit/browser-surface.test.ts` asserts that, including
  that nothing which *sends* is declared anywhere.

## The build order is the design

§10.5 and the project plan both insist on it, and it is easy to get backwards:

1. `sys/calendar_link` and the reconciliation loop, against a **fake provider recording every call**
2. the safety wrap over `send:invite` — outbound cap, redaction, the ledger gate
3. the per-conference lock (C10)
4. `provider:google` **last**, once the safety machinery already holds

Build Google first and add the dedup gate afterwards and you have shipped a thing that
double-invites. `FakeProvider.ts` is therefore **not a test mock** — it is a real provider plugin,
loaded always, and it is the only reason sentences like *"a full sync twice writes nothing on the
second pass"* can be assertions rather than hopes. Those are claims about provider **calls**, and
calls are what it counts.

## Two orderings that are load-bearing

**Cancellation is checked before the hash.** The content hash covers only what a speaker would
notice about a *live* event — start, end, title, room, attendees — so a cancelled segment's hash is
typically **unchanged**. A reconciliation that compares hashes first no-ops the cancellation and
leaves the event alive in the speaker's calendar. `calendar-sync.test.ts` cancels a segment without
touching any hashed field, precisely so a hash-first regression fails.

**Links are scoped by `top_id`, not by walking the live tree.** That is why `top_id` is
denormalised onto the link. A resolver that discovers events through surviving `parent_id` chains
loses exactly the events whose ancestors were deleted — the C8 failure. The test deletes a whole
day and asserts nothing is stranded; an orphaned event is a meeting a speaker still turns up to.

## Four things the toolchain forced

| | |
|---|---|
| **`null` in a String field** | The generated entity validator rejects an explicit `null`, exactly as `ent.aon` already records for `parent_id`. |
| **…and so is `''`** | `valid: Skip` still refuses an empty string, so `last_error` carries `valid: 'Empty'`. "No error" has to be expressible, or a link that once failed carries that failure for ever. |
| **`confirm` cannot be in the message shape** | Declared required, an unconfirmed `apply:sync` **throws**; given a literal default, it folds into the *pattern* and an unconfirmed call matches nothing. Both turn C4's refusal into an exception, and a refusal that arrives as a stack trace is not one the caller can act on. So `confirm` is read from the message and anything but `true` refuses. |
| **`id$` only creates** | Saving an existing id that way is `entity-id-exists` — the same trap the snapshot upsert hit on republish. Updating a link loads the row first. |

## The safety chain, and why it is prior-wraps

`CalendarSafety.ts` layers three same-pattern overrides above `send:invite`, each calling
`this.prior()`:

```
cap (C5)  ->  redaction (C7)  ->  ledger gate (C2/C3)  ->  provider dispatch
```

**Where they sit is the design, not what they do.** Above the dispatch, they hold for *every*
provider — including ones added years from now by someone who never reads this file. Put them
inside a provider and the next provider ships without them; put them inside `apply:sync` and the
next caller — a retry, a queue replay, a scheduler — ships without them. The tests therefore post
`send:invite` **directly**, bypassing `apply:sync` entirely, because that is what those callers do.

Registration order is inverted relative to execution: each definition wraps the previous, so the
outermost is registered last. The cap is outermost because refusing early is the whole of "bounded
blast radius", and a cap under redaction would report an unredacted reason.

**The redactor is one function at the sink** (`src/lib/redact.ts`), not a rule applied at call
sites. The threat is not a developer logging a secret on purpose; it is a provider SDK throwing an
error whose message embeds the request it failed on, that string being stored in `last_error`, and
`last_error` then reaching a console, a log aggregator and a support ticket — without ever passing
through anybody's own code. Sinks are countable; call sites are not. It drops `Error.stack`
outright, because a stack is the commonest way a request body reaches a log.

## The lock (C10)

Per top fixture, acquired by `apply:sync` and released in a `finally` — a run that throws must not
lock a conference out until the TTL. Three properties the tests pin: only the holder can release
(otherwise a timed-out run unlocks the run that replaced it, and then both are live, which is the
duplicate path); a stale lock expires, so one crash is not permanent; and a second run while the
first holds it is refused before any provider call.

**It is in-process, which is correct locally and a lie at Stage 4.** Two Cloudflare isolates share
no `Map`. The message shape is what survives — `acquire:lock` / `release:lock` become a Durable
Object behind the same patterns, which is the point of putting it behind messages at all.

## The queue (§10.6)

`apply:sync` **enqueues and returns**; `work:queue` sends. One job per (segment × account), and
that granularity is the point: a provider rejecting one speaker's invitation does not touch the
other thirty-nine, and retrying it does not re-send theirs. A run-level retry would do both.

**Jobs are rows, not promises.** A run that survives a restart is the difference between "resume
where it stopped" and "start again", and starting again is how a crash becomes a second invitation.

**The job carries the item that was confirmed**, frozen at enqueue time. The organiser confirmed a
specific plan (C4); recomputing it at execution time could send something they never agreed to
because somebody saved a fixture in between. A test retitles a session after confirmation and
asserts the queued job still sends the old title — and that the change is picked up by the *next*
plan, so nothing is lost.

**Backoff is exponential with jitter, and both the clock and the random source are injected.** The
jitter is not decoration: a provider that rejected a hundred jobs in one tick would otherwise get
all hundred retries back in the same instant, which is how a rate limit becomes an outage. A
backoff test on the wall clock fails on a slow machine, and a jitter test on `Math.random` is a
coin flip that eventually lands wrong in CI.

`drain:run` works a run until nothing is **due** — not until nothing is pending. Draining past a
job's `next_at` would defeat the backoff it was just given. It is the local monolith's stand-in for
a scheduler; Stage 4 replaces the *caller* with cron, not the message.

**Two sinks for a failure, on purpose.** The job records every attempt, because the job is the unit
of retry. When a job is finally *abandoned* the reason is stamped on the **link** as well — a job
dies with its run, and "this segment's invitation never went" must not disappear with the run that
discovered it.

**C10 now has two halves.** The advisory lock makes the check-and-create atomic within a process;
an active **run row** is what survives a restart, and "one sync at a time per conference" has to
survive one.

## The sync plan screen

`mockups/src/SyncPlan.dc.html`, reached with **`S`** from the agenda grid — it is something you do
*to* a conference, not a place, so it is a keystroke rather than a nav item.

**The screen exists to make the ledger visible.** Everything the reconciliation does is invisible
by construction: its job is to *not* send things. Without this page "we never send a duplicate" is
a claim an organiser has to take on faith. The most important element is the quiet grey row —
*"6 further segments · hash unchanged · no-op · zero provider calls"* — which is C2 shown rather
than claimed.

Two things the backend had to grow for it:

- **`sys/calendar_link.spec_json`.** The hash answers *whether* something changed; only the stored
  spec answers *what*. An organiser told "hash differs" has been told nothing and will either apply
  blindly or not at all. `diffSpecs()` turns it into "room + start time".
- **Recipient names, not emails.** C6 is about the public path, but a screen that doesn't need an
  address shouldn't carry one. `plan:sync` also returns the connected accounts — without their
  `secret_ref`, since the object goes to a browser.

**The Apply button is disabled and says why.** There is no `apply:sync` on the browser surface at
all; applying reaches real speakers.

### The dev seed replays a real history

The screen can otherwise only ever show one thing: every row a `create` before the first sync,
every row a `noop` after it. Neither shows what the plan is *for*. So the seed replays the sequence
an organiser is actually in — **you synced, then things changed**:

1. "Undo as a Contract" was **confirmed** when invitations went out. The fixture stores it cancelled
   because that is where it ends up; the cancellation happened *after* the sync.
2. Then it was cancelled — so the plan must cancel a provider event, and its hash is **unchanged**,
   which is exactly the case a hash-first reconciliation would silently skip.
3. A co-mentor joined the workshop: invisible in the grid, material to a calendar entry, so the plan
   reads "attendee set".

Each step is a real product event replayed in order, against the recording fake, and the end state
of the fixture data is unchanged.

## Not built yet, and deliberately

- **`apply:sync` has no `aim:` surface.** Applying reaches real speakers. Only `aim:cag,plan:sync`
  is declared, and it is read-only. The confirmed surface lands with the sync-plan and sync-run
  screens (mockups `SyncPlan.dc.html`, `SyncRun.dc.html`).
- **No scheduler.** `drain:run` has to be called; nothing ticks on its own yet. The plugin's `tick`
  locally and Cloudflare cron deployed (§10.6).
- **RSVPs.** The fake answers `not-supported`, which is the honest answer — a silent success would
  read as "nobody has responded yet" forever.
- **Any real provider.** Google is last, on purpose.

## One toolchain note, unrelated but found here

`npm run model-breaking` **exits 1 on an unchanged model**: `aontu breaking` cannot compare
`$.main.ent.cag`'s path-dependent spread template and reports `[compat]`. Verified by stashing all
changes and re-running. It cannot be a CI gate until that is resolved — worth raising, since the
plan called for `breaking` in CI from the first commit.
