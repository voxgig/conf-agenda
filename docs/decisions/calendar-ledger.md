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

## Not built yet, and deliberately

- **`apply:sync` has no `aim:` surface.** Applying reaches real speakers. The confirmed surface
  lands with the lock (C10) and the queue (§10.6), not before. Only `aim:cag,plan:sync` is
  declared, and it is read-only.
- **C7 redaction.** There are no credentials yet: `sys/calendar_account.secret_ref` carries a
  sekreto *name* from the first row, so C7's placement holds, but the redactor arrives with the
  first real provider.
- **C10, the lock.** Concurrent syncs are the other way duplicates appear. Advisory locally, a
  Durable Object on Cloudflare.
- **RSVPs.** The fake answers `not-supported`, which is the honest answer — a silent success would
  read as "nobody has responded yet" forever.

## One toolchain note, unrelated but found here

`npm run model-breaking` **exits 1 on an unchanged model**: `aontu breaking` cannot compare
`$.main.ent.cag`'s path-dependent spread template and reports `[compat]`. Verified by stashing all
changes and re-running. It cannot be a CI gate until that is resolved — worth raising, since the
plan called for `breaking` in CI from the first commit.
