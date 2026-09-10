# `tiny` — the smallest fixture that exercises the model

SPEC §18: *"one conference, two rooms, four segment fixtures, one deliberate clash, small enough
to hold in your head."* Build this before `nodeconf`.

Test fixtures are the specification in executable form. This one is deliberately minimal and
deliberately **wrong in exactly one way**.

## What's in it

**Tiny Conf 2027**, Wed 3 Nov 2027, `Europe/Dublin`, 08:30–17:00. Flat — no `day` fixture;
nesting is `nodeconf`'s job.

| Segment | Room | Time | Note |
|---|---|---|---|
| Opening Keynote (`key`) | A | 09:00–10:00 | |
| Message Buses (`tak`) | A | 10:00–11:00 | **near-miss** — starts exactly as the keynote ends |
| D1 at the Edge (`tak`) | A | 10:30–11:30 | **the clash** — overlaps Message Buses by 30 min in Room A |
| Coffee (`brk`) | B | 11:00–11:30 | same time as part of D1, different room — not a clash |

Two rooms, one track, three speakers, three appearances.

**The deliberate clash** is `seg_buses` + `seg_d1edge` — one `room-double-booked` error, no more.

**The deliberate near-miss** is `seg_keynote` + `seg_buses`: same room, touching at a shared
instant. Half-open intervals mean this is *not* a clash. If a change ever makes it one, the
product starts telling every speaker about a collision that does not exist — so the fixture pins
it, not just the unit test.

Times are UTC epoch **milliseconds**. November in Dublin is GMT, so wall time equals UTC here and
the numbers stay readable. That is a convenience of this fixture, not a property of the model —
the DST fixture (SPEC §8.3, not optional) is where that assumption is deliberately broken.

## The two files

- **`tiny.json`** — the row data, keyed by canon. What a store loads, and what
  `test/unit/fixture-tiny.test.ts` asserts over.
- **`tiny-graph.aon`** — the same conference as an **edge set**, checked by `aontu relations`.
  Separate because relation properties are checked over data, not over type declarations
  (see `docs/decisions/ontology-mechanism.md`). It imports `model/ontology.aon`, so the relation
  declarations cannot drift from the model.

Run the graph check with `npm run model-check`.

## Both checks are known to bite

Verified by breaking them on purpose, not by assuming:

- Remove a speaker's `email` →
  `presents: cag/speaker/spk_ada is not what presents targets`
- Remove one segment's `containedBy` →
  `contains: cag/fixture/seg_coffee does not list cag/fixture/conf_tiny under containedBy`
