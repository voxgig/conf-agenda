# Explanation: architecture

*Diátaxis: explanation - how conf-agenda fits together.*

## Model-driven

The model (`backend/model/*.aon`) is the single source of truth:
entities, services, messages, environments, and the design theme. It
compiles (aontu unification) to `model.json`, which drives entity
validation, code generation (`@voxgig/build`), message wiring
(`@voxgig/system`), and - if the web env is active - the web UI at
runtime. Change the model, run `model-build`, and every derived layer
follows.

## Messages, not calls

The backend is a [Seneca](https://senecajs.org) system: services
communicate by pattern-matched messages (`aim:thing,get:info`), not
imports. `MakeSrv` wires each model-declared message to its action
file by naming convention. Locally all services run in one process
(`npm run local`); deployed, the same messages travel over transport
(e.g. one Lambda per service) - service code is identical in both.

## Ownership of generated code

Two rules keep generation and hand-editing from fighting:

- `backend/gen/` (deployment artifacts) is regenerated every build -
  never edit.
- Application code (`src/`, `web/`, seeds, custom views) is
  create-once - generated as a starting point, then yours; re-running
  generation never overwrites it. (Exceptions: `web/src/views.js` and
  `web/src/theme.css` are pure functions of the model and regenerate.)
