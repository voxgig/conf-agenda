## Why

<!-- The problem, in two sentences. Why now? -->

## What is wrong today

<!-- The current behaviour, with the file:line, test or output that shows it.
     A proposal with no evidence here is describing a preference, not a defect. -->

## What Changes

<!-- Be specific about new capabilities, modifications and removals.
     Mark breaking changes with **BREAKING**. -->

## Specs cited

<!-- The SPEC or PLATFORM section this change serves, by number, from
     metsitaba/project-specs (read-only; never open a PR against it).
     Say plainly "neither" if it serves neither - some work is tooling. -->

## Decisions

<!-- Every fork (two or more viable ways to build it) and the option chosen.
     A fork the user has not chosen yet stays listed as open: it is not a
     decision until they make it. -->

## Upstream

<!-- Does this need anything from the platform maintainer? If so it also goes
     in docs/decisions/to-raise-upstream.md with its evidence. "Nothing" is a
     fine answer. -->

## Capabilities

### New Capabilities
<!-- Each creates specs/<capability-path>/spec.md. kebab-case, flat layout. -->
- `<capability-path>`: <what this capability covers>

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS change, at their exact existing
     path under openspec/specs/. Leave empty if none; a change with no
     capabilities at all (tooling, docs, pure refactor) sets
     `skip_specs: true` in its .openspec.yaml rather than inventing one. -->
- `<existing-capability-path>`: <what requirement is changing>

## Impact

<!-- Affected code, messages, model keys, surfaces, fixtures. -->
