# `nodeconf` — the realistic fixture

**The real NodeConf EU 2026 programme**, fetched from <https://www.nodeconf.eu/program> on
2026-09-21. SPEC §2 is explicit about why: *"Fill the fixture from the actual published programme.
Do not approximate it from memory — the value is in it being real."*

| | |
|---|---|
| Conference | NodeConf EU 2026, 29–30 September 2026 |
| Venue | Hotel Savoia Regency, Via del Pilastro 2, 40127 Bologna, Italy |
| Shape | 2 days · 34 published sessions · 27 speakers · single track |
| Timezone | `Europe/Rome` (CEST, UTC+2 on both dates) |

## What is verbatim

Every session **title**, **speaker name**, **start time** and **end time**, and the day each sits
on, is exactly as published. Session kinds are mapped from the programme's own labels:
Registration → `reg`, Talk → `tak`, the opening and closing → `key`, coffee breaks → `brk`,
Lunch → `mea`, Happy hour and Social dinner → `soc`.

## What is derived, and why

Three things, all of them flagged here rather than buried:

1. **The happy hour's end time.** The programme gives `18:00` with no end. It is modelled as
   ending at `19:30`, which is the social dinner's published start — derived from the source
   rather than invented.
2. **The social dinner's end time.** The programme gives `19:30` with no end. A nominal `22:30` is
   used because the model needs one: `t_end` must be after `t_start` or `negative-duration` fires.
   **This is the one value in the file that is not derivable from the source.**
3. **The room name.** The programme states a single track with all sessions in one room and does
   not name it, so the fixture carries one room called `Main Hall`. The *count* is real; the name
   is a placeholder, and the grid needs at least one room to place a card in.

## What is deliberately absent

**No emails, bios or photos.** These are real, named people and none of that is published.
Inventing it would put fabricated contact details for real individuals into a committed file. The
absence is also the honest state a freshly imported programme is in — and it is exactly what
`speaker-no-email`, `missing-bio` and `missing-photo` exist to report. The fixture validates with
**0 errors and 108 warnings**, all of them true statements about the data.

One consequence worth knowing: **this fixture cannot drive a calendar sync**, because
`speaker-no-email` is a warning for the agenda and an **error** for sync (SPEC §16.2). Use `demo`
for that.

**No tracks.** The 2026 edition is single-track and publishes none.

## The nesting

SPEC §19.1 asks for "at least one explicit day fixture, and segments hanging at both depths". Both
days are explicit `kind: 'day'` fixtures with the programme under them; the two evening socials
hang off the **conference**, because they are conference-wide rather than part of a day's
programme. So: 1 node at depth 1, 4 at depth 2 (two days, two socials), 31 at depth 3.

## Where this fixture diverges from SPEC §2, and it is not a defect

§2 asks this fixture to exercise "a handful of rooms, so the grid is dense rather than sparse",
workshops, and "the social and outdoor sessions that a conference-in-a-country-house schedules".

**The 2026 edition is none of those things.** It is a single-track, two-day conference in a
Bologna hotel. §2 was written against the Kilkenny / Waterford Castle editions, which ran morning
talks and afternoon workshops across several rooms. The conference moved; the spec did not.

The choice here was to keep the data **real** — which §2 states as the overriding requirement —
and to record the gap rather than fabricate a country house. Consequences:

- **Multi-room density is covered by `demo`** (three rooms) and the clash case by `tiny`.
- **Workshops (`wrk`) and outdoor sessions appear in no fixture.** That is a genuine hole.

Written up in `docs/decisions/nodeconf-fixture.md`, and on the list to raise with Richard: either
§2 should name the edition it describes, or the fixture should be built from an older programme
that is no longer published on the site.
