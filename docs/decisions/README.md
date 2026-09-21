# Decisions

Project-local decision records. Cross-project ones go in `PLATFORM.md` instead (PLATFORM.md §9.4).

Each of these exists because something was decided that the spec does not settle, or because the
toolchain turned out to differ from what the spec assumes. They are written so the *reasoning*
survives, not just the outcome — SPEC §20 assumes the next stage may start six months later with
no memory.

| Record | What it settles |
|---|---|
| [cloudflare-spike.md](cloudflare-spike.md) | Seneca 4 **does** run on Cloudflare Workers — per-request construction with `close()` in a `finally`. Reverses an earlier wrong verdict; PLATFORM.md §6 points here. Repro included. |
| [fixture-model-inheritance.md](fixture-model-inheritance.md) | Where `cag/fixture` comes from — the field-by-field mapping from `fixture-srv`'s `core/fixture`, and every deliberate departure (epoch ms, no `t_tzo`, `public` inverted to `private`, the `kind` code set, venue on the fixture). |
| [ontology-mechanism.md](ontology-mechanism.md) | How `ontology.aon` actually works: `@"std/system"` is served from the engine, and relation edges come from **data**, not type declarations — declaring `cag/fixture contains cag/fixture` is a self-loop that `acyclic` correctly rejects. |
| [calendar-ledger.md](calendar-ledger.md) | Where the sync ledger lives while `@seneca/calendar` catches up, why it answers `sys:calendar,*` rather than `concern:*`, why the fake provider is built **first**, and the two orderings that are load-bearing (cancellation before the hash; links scoped by `top_id`). |
| [web-env-and-generic-ent.md](web-env-and-generic-ent.md) | Why the generated generic `ent` service is never declared, why the generated test suites are out of the run, the vendored browser-store, and the still-open generic-admin gap. |

Two of these record a mistake as well as a decision — the Cloudflare verdict that was wrong for a
day, and the auth service that appeared broken because its messages were never declared. Both are
kept deliberately: the wrong turn is the useful part.
