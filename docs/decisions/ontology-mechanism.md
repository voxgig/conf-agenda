# How `ontology.aon` actually works

SPEC §8.2 specifies `model/ontology.aon` and `aontu relations`, but not the mechanism. Working it
out cost an hour; this is what it turned out to be, so nobody repeats that.

## `@"std/system"` needs no file

It is served from the aontu engine itself — no filesystem, no package resolution, available under
every include capability except `none`. Do not go looking for a `.aon` file to vendor; there isn't
one. It is marked **EXPERIMENTAL** upstream, and `Relation` is exactly three optional keys:

```
Relation: type({
  target?: top
  inverse?: string
  acyclic?: *false | boolean
})
```

## Edges come from data, not from type declarations

This is the part that is easy to get wrong, and the error is confusing when you do.

The obvious reading of "a fixture contains fixtures" is to declare it at the type level:

```aon
Fixture: id(cag/fixture) & { contains: [&: refer(), cag/fixture] }
```

That **fails**, and correctly:

```
$.Fixture.contains.0  contains: cycle cag/fixture -> cag/fixture
```

A recursive entity is a self-loop at the type level, and `acyclic` rejects self-loops. But the
fixture tree is only acyclic at the *instance* level — conference → day → talk, no ring.

So `ontology.aon` declares the **relations and their target schemas only**. The edges live in data
documents (the test fixtures), and `aontu relations` checks the relation properties over those.
SPEC §8.2's phrasing is exact once you have seen this: *"the declaration checks the model and
vetted data."*

A real tree passes:

```aon
conf2027: id(cag/fixture/conf2027) & { contains: [&: refer(), cag/fixture/day1] }
day1:     id(cag/fixture/day1)     & { containedBy: [&: refer(), cag/fixture/conf2027]
                                       contains: [&: refer(), cag/fixture/talkA] }
talkA:    id(cag/fixture/talkA)    & { containedBy: [&: refer(), cag/fixture/day1] }
```
→ `verdict: pass`

And a deliberate cycle fails, naming the whole path — which is the behaviour SPEC §8.2 promises:

```
$.conf2027.contains.0  contains: cycle cag/fixture/conf2027 -> cag/fixture/day1
                                 -> cag/fixture/talkA -> cag/fixture/conf2027
```

**Links are addresses, not `$.` references.** `$.Fixture` inside a link raises
`[aontu/path_cycle]`. Write the entity id (`cag/fixture/day1`) as a bare address, as
PLATFORM.md §1.3's example does.

`inverse` is checked both ways: declaring `contains` without the matching `containedBy` on the far
end fails with *"X does not list Y under containedBy"*. Both ends, every edge.

## `ontology.aon` is NOT imported into `model.aon`

It is checked on its own. Importing it would put std/system's vocabulary into `model.json`, which
the generator does not expect. SPEC §8.2 says it sits *alongside* the other model files, and CI
checks it with `aontu relations` — not that it joins the entity model.

## The scripts

```
npm run model-check      # aontu relations ontology.aon && aontu hash model.aon
npm run model-breaking   # aontu breaking --against git#HEAD model.aon
```

`--against` takes `git#<rev>`, not a bare rev — `--against HEAD` fails with `ENOENT: open 'HEAD'`.

**`model-breaking` is deliberately not part of `build`.** On this first model commit it correctly
reports `compat_required_added` at `$.main.ent.cag` — the new model requires a `cag` key the
previous one had no notion of. That is right and expected while the model is being introduced, and
it would fail CI on every early commit. Wire it into CI once there is a published baseline worth
protecting; its output is also very large (it dumps both models inline), so it wants `--jsonl` or
a filter before it goes anywhere automated.
