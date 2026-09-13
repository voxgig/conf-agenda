# Where `cag/fixture` comes from

`cag/fixture` is inherited from `metsitaba/fixture-srv`'s `core/fixture`, not designed fresh.
This file records the field-by-field mapping and every place we deliberately depart, so a later
reader can tell an inheritance from an invention.

Source read: `lib/fixture_base_schema.ts`, `fixture-srv.ts` and `entity.dot` at
`metsitaba/fixture-srv@master` (last pushed 2021-05-24).

## The shape we are taking

`entity.dot` states the recursion in one line:

```
fixture -> fixture [label="parent_id"]
```

One entity, nested. Not a conference/day/session tower.

## Field mapping

| fixture-srv | cag/fixture | Note |
|---|---|---|
| `id` | `id` | — |
| `org_user_id`, `org_id` (from `meta.custom.principal.org.id`) | `org_id` | Server-set from the caller's org, same as upstream. Ours refs `sys/org`. |
| — (stored as `fixture_id`; `parent_id` renamed on save) | `parent_id` | Upstream accepts `parent_id` then renames it to `fixture_id` before storing. We keep `parent_id` throughout — one name, no translation step. |
| `top_fixture_id` | `top_id` | **Client-forbidden upstream** (`Joi.forbidden()`, comment: *"prevent infinite loops"*). Maintained by walking to the parent and taking its `top_fixture_id`, or the parent's own id if the parent is top. We keep the behaviour and shorten the name. |
| `title` | `title` | `Min(1).Max(300)`. |
| `desc` | `desc` | Markdown for us. |
| `kind` | `kind` | Code set changes — see below. |
| `w_site`, `w_video`, `w_deck` | same | `w_blog` dropped; nothing in the spec uses it. |
| `t_start`, `t_end` | same | **Units change: seconds → milliseconds.** |
| `t_tzn` | `t_tzn` | IANA zone name. Required on a top fixture, inherited down. |
| `t_tzo` | **dropped** | See departures. |
| `t_txt` | dropped | Free-text date description; superseded by real times plus the grid. |
| `public` (default `false`) | `private` (Boolean) | **Polarity inverted** — see departures. |
| `when`, `where` (human strings, derived from parent) | dropped as fields; the *mechanism* is kept | Upstream derives these from the parent via `make_derive_parent_field`. We keep derive-from-parent but apply it to `t_tzn` and venue, and carry derived values under the `d_` prefix. |
| `p_lat`, `p_lng`, `p_gc`, `p_web`, `p_name` | **open — see below** | — |
| `avatar` | dropped | Speaker images live on `cag/speaker`. |
| `mark` | dropped | Debugging aid. |
| `d_title_search` | dropped for now | Search is not in scope at S1. |
| `act_id` (commented out upstream) | not adopted | SPEC §21 Q8: defer until a real series organiser asks. The field can be added later without migration. |
| — | `room_id`, `track_id` | New; refs `cag/room` / `cag/track`. |
| — | `slug` | New; public URL slug on top fixtures. |
| — | `status` | New; `draft` / `confirmed` / `cancelled`. |
| — | `embed` | New; embed config on top fixtures. |

## Deliberate departures

**1. Epoch milliseconds, not seconds.** Upstream comments `t_start`/`t_end` as "UTC epoch
seconds". SPEC §8.3 specifies milliseconds. JavaScript-native, and it removes a unit conversion
at every boundary.

**2. `t_tzo` is dropped, deliberately.** Upstream stores a timezone *offset in minutes* beside the
zone name. SPEC §8.3 forbids it: an offset is derived and DST-dependent, and storing one is how an
event drifts an hour. Derive it when a wire format needs it. The zone name is authoritative.

**3. `public` becomes `private`.** Upstream defaults `public: false` — closed by default, opt in to
publish. We store `private` instead. Same default posture, but it reads correctly against SPEC §8's
inheritance rule: *any node under a `private` ancestor is effectively private*, most-restrictive-
wins down the tree. "Most restrictive wins" is natural over `private`, and awkward over `public`.

**4. `t_end > t_start` is strict.** Upstream uses `Joi.number().min(Joi.ref('t_start'))`, which
permits a zero-length fixture. SPEC §16.1's `negative-duration` rule is *"`t_end` is not after
`t_start`"* — so equal is an error. Expressed as a `must()` in the model, with the rule kept in
code too so imported and API data get the same diagnostic shape.

**5. The `kind` code set changes.** Kept from upstream: `con`, `web`, `mep`, `sem`, `gen`, `tak`,
`wrk`, `pan`. Dropped: `trd` (tradeshow), `met` (meeting), `hst` (mc/host), `deb` (debate), `prf`
(performance) — none appear in the spec. Added: `day` (grouping), `key`, `lgt`, `brk`, `mea`,
`soc`, `reg`. The additions are what a conference-in-a-country-house actually schedules, and SPEC
§2 names them as the reason a talks-only model fails.

Unlike upstream, the codes also constrain the **shape of the tree** (SPEC §8.1), enforced at save
time as `bad-parent-kind`: top kinds have no parent and are the only kinds that may; `day` sits
directly under a top kind; segments sit under a top or a `day` and contain nothing.

**6. Joi is replaced by the Aontu model.** Every constraint upstream expresses in Joi moves into
`ent.aon`, where the API validator, the SDKs, the generated forms and the agent tools all inherit
it. Only the relational and temporal rules (SPEC §16) stay as code.

**7. A top fixture's `parent_id` is absent, not null.** SPEC §8.1's sketch comments `# null =
top`, and fixture-srv allowed null explicitly (`Joi.string().allow(null)`). The entity validator
built from this model rejects an explicit null in a `kind: String` field, so a top fixture simply
does not carry the key. Found by seeding the `tiny` fixture into a real store, which failed with
*"Validation failed for property parent_id with value null because the value is not of type
string"*. All tree code tests `null == parent_id`, which is true for both absent and null, so
nothing downstream cares which it is.

## Resolved — the `p_` (place) family

Upstream carries venue geo on the fixture itself: `p_lat`, `p_lng`, `p_gc`, `p_web`, `p_name`.

SPEC §2 says to take the prefixed field families including `p_` place, and §8.1 says *"a fixture
with no explicit venue inherits its parent's"* — so venue has to live somewhere. But §8.1's own
model sketch carries no `p_` fields at all, and `cag/room` covers rooms within a venue rather than
the venue itself.

Three options, none settled:

1. **`p_` fields on the top fixture** — closest to upstream; venue inherits down the tree exactly
   as §8.1 describes.
2. **A `cag/venue` entity** — cleaner for an organiser running several editions at one venue, but
   a new entity the spec does not name.
3. **Nothing at S1** — the `tiny` and `nodeconf` fixtures are single-venue, and the grid does not
   need it. Add when a real multi-venue conference appears.

**Decided: option 1** (2026-09-09). It is what upstream did, it satisfies the inheritance
sentence, and it costs five nullable fields on one entity rather than a new entity and a new join.
