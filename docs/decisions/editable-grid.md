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
