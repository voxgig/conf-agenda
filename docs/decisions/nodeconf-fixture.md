# The `nodeconf` fixture, and where the spec and the conference disagree

**Decided 2026-09-21.** SPEC §2 asks for `test/fixtures/nodeconf/` to be built from the real
NodeConf EU programme, and is unusually firm about it:

> Fill the fixture from the actual published programme. Do not approximate it from memory — the
> value is in it being real.

It is built from the **NodeConf EU 2026** programme, fetched from
<https://www.nodeconf.eu/program> on 2026-09-21. Two days, 34 published sessions, 27 speakers,
Hotel Savoia Regency in Bologna, `Europe/Rome`.

## The divergence, and why the data won rather than the description

§2 also says what the fixture is *for*:

> **A single venue with a handful of rooms**, so the grid is dense rather than sparse … keynotes,
> talks, workshops, and the social and outdoor sessions that a conference-in-a-country-house
> schedules.

**The 2026 edition is none of those things.** It is single-track, in one room, in a city hotel,
with no workshops and no outdoor sessions. §2 was written against the Kilkenny / Waterford Castle
editions, which ran morning talks and afternoon workshops across several rooms. The conference
moved; the spec did not.

Reaching an older programme was tried and failed: `nodeconf.eu/event-list` and `/event-details/*`
now return 404, the Wayback snapshot of the 2024 agenda is a Wix page that renders its content
client-side, the archive.org availability API rate-limited, and no public repository carries the
schedule.

So the choice was between **real** and **matching the description**, and §2 names real as the
overriding requirement. What that costs, stated plainly:

- **Multi-room density is not exercised here.** `demo` has three rooms; `tiny` has the clash.
- **`wrk` (workshop) and outdoor sessions appear in no fixture at all.** That is a genuine hole,
  and it is the one worth raising.

**For Richard:** either §2 should name the edition it is describing, or the fixture should be
built from a programme that is no longer published — in which case somebody with a copy needs to
supply it. This is on the list to raise verbally, like the others.

## What the fixture deliberately does not carry

**No emails, bios or photos.** The speakers are real, named people and none of that is published.
Inventing it would put fabricated contact details for real individuals into a committed file.

The absence is also the honest state a freshly imported programme is in, and it is exactly what
`speaker-no-email`, `missing-bio` and `missing-photo` exist to report. The fixture validates with
**0 errors and 108 warnings**, every one of them a true statement about the data.

One consequence: **this fixture cannot drive a calendar sync**, because `speaker-no-email` is a
warning for the agenda and an **error** for sync (§16.2). `demo` is the fixture for that.

It is **not loaded by the dev seed**, which stays at `tiny` + `demo` — a third conference would
change what `DEMO.md` describes and what the e2e conference picker counts.

## Three values are derived, and they are flagged in the fixture's README

The happy hour's end time (taken from the social dinner's published start), the social dinner's end
time (nominal — the one value not derivable from the source, and the model needs a `t_end` or
`negative-duration` fires), and the room's *name* (the programme states one room and does not name
it; the count is real, `Main Hall` is a placeholder).

## What the real programme found

This is the part that justifies the fixture existing at all. Two warnings fired on data nobody
designed to be clean, and **both rules were wrong, not the data**:

**`no-turnover` fired 33 times.** Every one was a zero-minute gap between back-to-back talks in the
single room — and there was **not one** pair in the 0-to-10-minute band the rule exists for. A
single-track conference runs back-to-back by design: the next speaker steps up to the same lectern.
So exactly zero is now a scheduling choice rather than a missing turnover, and the rule warns only
when somebody left a gap and left too little.

**`long-gap` fired on an overnight.** Day one's dinner ends at 22:30 and day two's first coffee is
at 08:30, which the rule read as ten hours with nothing on. Two sessions on different days are not
consecutive in any sense an organiser cares about, so the walk is grouped by room **and parent**.

Both were the failure mode written into `warnings.ts`'s own header — an over-eager warning does not
block anything, it just trains people to stop reading the panel. Neither would have been found on
`tiny` or `demo`, because both of those were written by someone who already knew the rules.
