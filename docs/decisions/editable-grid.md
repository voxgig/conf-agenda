# The editable grid: named intents, and undo as an inverse

**Decided 2026-09-21.** SPEC §9 settles the *shape* — every mutation is a named intent with a
closed payload — and PLATFORM §1.4 settles the *undo contract*. What neither settles is what the
toolchain would do when asked to carry them, which turned out to be the expensive part.

## The surface

Seven intents, all on `aim:cag`, each with an `aim:web,on:cag` proxy:

| Intent | `inverse` |
|---|---|
| `move:segment` | itself, from `result.prev` |
| `set:status` | itself |
| `make:segment` | `remove:segment` |
| `duplicate:segment` | `remove:segment` |
| `remove:segment` | **none** |
| `add:appearance` | `remove:appearance` |
| `remove:appearance` | `add:appearance` |

**SPEC §9's names, not the older plan file's.** That file said `clone:segment` and omitted
`make:segment`; the spec says `duplicate:segment` and lists `make:segment` as what `n` posts. The
spec wins, and the divergence is recorded here rather than raised — it is a stale plan, not a spec
defect.

**`remove:segment` is not in SPEC §9's list and has to exist anyway.** §9 says `duplicate:segment`
declares "the removal of the copy" as its inverse, and PLATFORM §1.4 requires an `inverse.pat` to
match a *declared* definition. So the removal is declared, and it declares no inverse of its own:
restoring a deleted subtree is not an ordinary edit, and PLATFORM §1.4 says the UI must show that.
The grid shows it by not offering `u`.

## `inverse` breaks the build, and it breaks it as a false green

This is the one worth reading twice.

`@voxgig/build`'s `MsgMetaShape` (`dist/shape/msg.js`) is a **closed** Gubu shape over exactly
`file, params, doc, out, web, api, transport`. It is applied to every message in the model by
`res_yml`, and to every `aim:cag` message by `srv_handler`. Aontu is perfectly happy with
`inverse` — `msg.aon` carries no element spread, and `@voxgig/model`'s `checkMsg` validates only
`pat`, `file` and duplicate patterns — and it serialises into `model/model.json` intact, which is
exactly what the SPA needs. But the generators refuse it:

```
MsgMeta: Validation failed ... because the property "inverse" is not allowed.
```

**And the build has already written `model.json` by then.** Producer order is `msg → model →
local`, so `model_producer` writes the file *before* the local generators run. The file on disk
looks correct. The build exits 1. And since `npm run build` is `model-build && tsc`, **tsc never
runs** — so `npm test` passes against the *previous* `dist-test`. Everything looks fine and nothing
was compiled.

`backend/build/msg_meta.js` strips `inverse` from the in-memory model, registered **first** in
`sys: model: order: action`. `model.json` keeps it; the generators never see it. Both halves were
verified rather than assumed: without the action, exit 1 and the message above; with it, exit 0 and
six `inverse` keys in `model.json`.

**The real fix is upstream** — `inverse: Skip({})` in `@voxgig/build/src/shape/msg.ts` — and it is
on the list to raise with Richard. Delete this action the day it lands; nothing else in the build
reads `inverse`.

**The element spread was deliberately not adopted.** PLATFORM §1.4 shows `main.msg` schematised by
`&: close({...})`; this project's `msg.aon` has never had one. Adding it would materialise
`web: {allow:false}` / `api: {active:true}` defaults onto all 51 existing definitions and change
generated output — and §1.4 itself warns that optional keys materialise wrongly. Deferred, not
forgotten.

## The checks PLATFORM assigns to model build do not exist

`@voxgig/model` 11.0.0 implements duplicate-pattern detection and nothing else. The action-file
collision check and both `inverse` checks are absent. Worse, **a declared-but-unimplemented message
boots cleanly**: `@seneca/reload` swallows `MODULE_NOT_FOUND`, registers a watcher and returns a
wrapper, so `msg.aon`'s own rule — "only declare a message whose action file EXISTS" — is enforced
by nothing, and the failure arrives the first time an organiser posts it.

`test/unit/msg-contract.test.ts` carries all four. **Top-level on purpose**: `npm test` globs
`dist-test/unit/*.test.js`, one level only. `test/unit/env/web/surface.test.ts` is the cautionary
example — nested, so it has never run, and run by hand it throws because it still reads
`main.msg.aim` on what is now a list.

It also turned up the one legitimate exception to tenancy-from-the-stored-row:
`aim:agenda,get:agenda` and `get:feed` take `org_id` from the caller, because the embed runs on a
third party's page and has no credentials to derive one from (SPEC §9.1). Safe only because both
are reads served from the published snapshot. Encoded as an allowlist that is itself asserted, so a
third entry fails the test before it reaches a review.

## Tenancy, in two layers — and why both are tested separately

No intent declares `org_id`, `owner_id` or `top_id` in its `params`, so there is no key to send;
and `saveRow` re-pins `org_id` from the loaded row regardless.

**Reverting either one alone does not fail the end-to-end test.** The action builds its `changes`
from named fields, so a payload `org_id` never reaches the save even with the pin gone; and with
the pin in place, an action that spread the whole message would still be caught. Good layering
makes a bad test — a defence nothing fails over is a defence that gets deleted in a refactor — so
there is a test that reaches past the action and hands `saveRow` the thing it exists to ignore.

## Save time versus publish time

`fixture-cycle`, `bad-parent-kind` and `cross-tenant-reference` refuse **before storing**. SPEC
§16.1 asks for the last of those explicitly ("checked at save time as well as at validate"), and
the cycle guard has no choice: after storing, every tree resolver and `clone:fixture` recurses for
ever.

Both rules keep **one definition**. `parentKindVerdict` was extracted from `tree_shape.ts` and
`crossTenant` from `references.ts`; the validator maps verdicts back to its own sentences, because
only a diagnostic needs to name the other fixture. A second copy of the branch logic beside the
validator is how the two drift apart.

**Everything else is a publish gate, not an edit gate.** `room-double-booked`,
`speaker-double-booked` and `outside-parent-fixture` do not block a save. An organiser rebuilding a
schedule the night before has to be able to pass through an invalid state, and `GridMove.dc.html`
draws exactly that: the card lands, two cards go red, the header counts them.

## The store cannot invalidate the grid, and no write verb can make it

The obvious move — add `move`/`make`/`duplicate` to `SenecaBrowserStore`'s `write` verb list in
`web/src/bus.js` — **cannot work**, and understanding why is the point.

The cache group is `zone / groupKeys / <value of the matched verb key>`, with `zoneKey: 'aim'` and
`groupKeys: ['on']`. So:

| message | group |
|---|---|
| `{aim:web, on:cag, load:tree}` — the grid's read | `web/cag/tree` |
| `{aim:web, on:cag, move:segment}` | `web/cag/segment` |

`invalidateGroup` matches the group id exactly. A `move:segment` write can never touch
`web/cag/tree`, whatever is in the list — adding verbs changes which group is dropped, never which
read is refreshed. So `bus.js` is deliberately **left alone**, and the grid invalidates
`web/cag/tree` explicitly from the one mutation helper that every intent and every undo goes
through.

**On failure too.** A rejected write heals only the write's own group, so without this the grid
would keep both its wrong optimistic state and its stale tree — and the optimistic state is the one
the organiser is looking at. This is the same class of bug as the cached `get:run`
(`calendar-ledger.md`), but invisible, because the move *did* apply on the server. Removing the one
`invalidate:group` call fails five e2e tests.

**`remove:appearance` has a related hazard.** `remove` is already a write verb, so it lands in
`web/cag/appearance` — which *is* the group behind the admin's cached `list:appearance`. If its id
param were named `id`, the store's optimistic removal would fire; named `appearance_id` it does
not, and the fallback `upsertGroup(gid, out.item)` would put the deleted row back. The action
returns no `item`, which is why it does not.

## Undo

`web/src/undo.js`, app-local. PLATFORM §5.5 lists the inverse-message undo log as something the
browser-store extraction must **add**, and the vendored `seneca-browser-store.js` has no undo or
inverse code at all — so this lives here rather than forking a file the project does not own. When
the store grows it upstream, this module is what moves.

Six rules, each from a failure mode rather than a preference:

1. **The declared inverse is not postable as declared.** `inverse.pat` names the *service* pattern
   (`aim:cag,move:segment`); the browser bus is pinned to `aim:web`. Every inverse is translated,
   and one whose proxy is not declared returns null rather than posting into the void.
2. **Push only on a settled `{ok:true}`.** The map reads `result.*` — `result.prev.room_id` is
   PLATFORM's own example — so before the answer there is nothing to build. This also deletes the
   "rolled back after its inverse was pushed" case entirely.
3. **Single-flight.** Two fast `Shift`-arrows otherwise reconcile last-response-wins, and the stack
   ends up ordered by when the server answered rather than by what the organiser did.
4. **`u` while a mutation is in flight awaits it first**, or it undoes the action before the one
   the organiser is looking at.
5. **A failed undo leaves the entry on the stack**, and the inverse of an inverse is never pushed —
   `u` is a stack walk, not a two-state flip-flop. The guard is a module flag, not a message field:
   `@voxgig/system` compiles `params` into a *closed* shape, so a stray `undo: true` is a refusal.
6. **The stack is cleared with the store** — on an auth change, and on a conference switch. A stale
   `u` posts an edit against a row nobody is looking at; the server refuses it, but the UI would
   have claimed an undo happened.

`buildInverse` is a pure function because `web/` had no unit runner. It has one now
(`node --test web/test/*.test.mjs`), which is where the path resolution, the falsy-value case
(`t_start: 0` is a real instant) and the stack semantics are pinned.

## Two things the grid learned from its own tests

**Focus follows the session, not the index.** A move reorders the list — that is what moving in
time means — so keeping `focusIndex` leaves the ring on whatever slid into that slot. This is the
ring-and-panel disagreement `paintFocus` already exists to prevent, one step removed. It applies to
undo as well: an undo settles focus on the session that came back.

**The error count is part of loading the grid.** It was first written as a consequence of editing,
which meant a conference that was already invalid opened clean and only admitted it after an
unrelated move. The seeded tiny fixture *is* already invalid — two talks overlap in one room, which
is what `rule-room-double-booked.test.ts` was built on — so the grid now recounts on every load.

## The validation panel

`v`, per SPEC §13.1 — "validate now, focus the first diagnostic". It **overlays** the grid rather
than replacing it, which is why `validate_panel.js` returns a node instead of mounting one the way
`sync_plan.js` does: a diagnostic about a double-booking is not readable without the thing it is
about, and `Enter` jumps into a grid that is still there.

**`diagIndex` is separate from `focusIndex`.** Walking the diagnostics must not drag the grid's
selection along behind the panel — the two lists are different lengths and in different orders, and
tying them would move the ring to an unrelated session on every `j`.

**Nothing here re-derives a rule or re-sorts a list.** The diagnostic structure is the backend's:
a stable `rule` id, a severity, a message naming both sides, and a human `fix`, already sorted
errors-first (SPEC §16.3, §17). The panel renders it. A browser that recomputed
`room-double-booked` would be a second implementation of the rule, and the two would drift.

**`Enter` on a diagnostic whose anchor is not on the current day says so.** Changing the day under
the organiser without telling them is worse than not moving.

It also opens with a fresh `validate:fixture` rather than trusting the header's count. The count is
refreshed after every settled intent, but `v` is also what an organiser presses after doing nothing
for ten minutes, and §13.1 says `v` means *validate now*.

## The last four §16.1 rules, and two things they forced

`fixture-cycle`, `bad-color-contrast`, `broken-asset` and `asset-escapes-root` complete §16.1, and
the eight remaining §16.2 warnings land with them. Each has a triggering case and a non-triggering
near-miss (SPEC §18) — an error that fires when it should not blocks a real conference from
publishing.

**A cycle is unreachable from the top, so the rule could never have fired where it was first put.**
None of a ring's members has an ancestor chain that arrives at the conference, so `resolve:tree`
does not return one and `cycles(input)` over the resolved subtree is structurally incapable of
seeing anything. It runs instead over everything that claims this conference via the denormalised
`top_id` — fixtures that still say they belong to it even though the tree can no longer reach them.
Scoping by org alone was the alternative and is wrong: a corrupt tree in one conference would block
publication of another.

**The rules stay pure, so the filesystem work happens outside them.** `src/lib/assets.ts` resolves
paths once and the rules are handed facts. Containment is judged on the **canonical** path, after
`realpath`: a symlink sitting inside the assets root and pointing outside it normalises to an
inside path and resolves to an outside file, and a build running in CI would copy it into public
output. Existence and containment fail independently, which is why the spec says to check both —
`../../secrets.txt` may well exist, and a path inside the root may well be missing.

**A rule that needs more than the tree can skip silently.** Both of the above return `[]` when they
are not given their extra input — correct for a pure function, and indistinguishable from "nothing
is wrong". `srv-cag-validate.test.ts` asserts each fires *through the service*, which is the only
place the wiring is visible.

### The contrast threshold is 3:1, and that was checked rather than assumed

`bad-color-contrast` first used 4.5:1 — AA for text — and failed three of the project's own brand
colours on a fixture that is meant to publish clean. That is the shape of a rule about to be
ignored, so the question became what the app actually draws.

It never renders a raw track colour as text. It is `.ca-seg-strip`'s background — a 3px rule that
identifies the track — and `.ca-seg-chip`'s background at 14%, whose *text* is
`color-mix(track 62%, var(--vg-text))`, mixed toward the body colour precisely so it reads on
either ground. So the criterion is WCAG 1.4.11 **non-text** contrast, 3:1, and the comment in
`contrast.ts` says why.

At 3:1 exactly one fixture colour still failed, and genuinely: vox-teal `#00c6d8` is **2.1:1** on
the white card surface. The demo fixture's Frontend track moved to `#2f7fd4` (4.0 dark / 4.1
light). That is the rule doing its job on real data rather than the data being bent to fit it — and
it is worth saying out loud that the brand's teal is not usable as a meaning-carrying mark on a
light ground.

## Bus-drive, and the two gaps it found

PLATFORM §10 and SPEC §18 both require it: *"a Playwright spec drives a full user journey through
`window.seneca.post()` with **zero DOM interaction**, asserting only that the DOM followed. Without
it, 'drivable by messages' decays into 'was built that way once'."*

`web/e2e/bus-drive.spec.js` does the journey §18 names — sign in, open a conference, create a
session, move it between rooms, publish. It found three things, and none of them would have shown
up any other way.

**Navigation was click-only.** `a.onclick → this.openEntity(canon)`, with no message anywhere.
PLATFORM §1.2 puts navigation on the in-browser bus, so the click now posts `cmp:evt,name:navigate`
and the shell subscribes. Two paths to `openEntity()` is how they drift; one is the point.
Selecting a conference in the grid went the same way, via `cmp:evt,name:conference`.

**`publish:fixture` had no `aim:web` proxy at all**, so the journey's last step was unreachable
from a browser. It has one now — and deliberately **no `confirm` param**, unlike `apply:sync`.
Applying a sync reaches real speakers, so C4 puts the confirmation *in the message* and the server
refuses without it. Publishing makes the organiser's own data public and already gates on
`validate:fixture`. So publish's confirmation is a **screen** (`PublishConfirm.dc.html`, reached
with `P`), and a screen is skippable by a caller in a way a message param is not — which is exactly
the distinction between the two.

**The grid only updated when it initiated the change.** This is the one worth remembering. Every
mutation reached the grid through `mutate()`, which is what invalidates the cache and reloads — so
a message posted from anywhere *else* changed the database and left the screen showing the old
world. The spec found it on the first run: `make:segment` returned `ok` and no card appeared.

The grid now `sub`scribes to every `aim:web,on:cag` mutation pattern — **derived from the model**,
so a new intent is followed automatically rather than added to a list somebody has to remember.
`sub` and not `add`: many observers, no interception. It fires when the message is *sent*, so the
refresh is debounced past the round-trip rather than racing it, and it is skipped entirely when
`mutate()` is already settling the grid's own call.

### The guard on the guard

A bus-drive spec that quietly grows a `click()` stops proving anything **and still passes**. So the
file reads itself and fails on `.click(`, `.fill(`, `.press(` and their kin — with comments
stripped first, because the header names `keyboard.press()` in prose and a guard that cannot tell
code from a comment fails on its own documentation.

All three are confirmed to bite: reverting the bus subscription, the navigate subscription, or the
`window.seneca` handle each fails the journey, and a sneaked `click()` fails the guard.
