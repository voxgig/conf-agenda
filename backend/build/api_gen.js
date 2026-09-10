// Generation action: api_gen. Regenerates the REST API artifacts on
// every model-build (when the model declares main.api):
// gen/api/openapi.json (OpenAPI 3.1, schemas from entity fields) and
// src/srv/api/valid_gen.ts (request-validation shapes). AUTO-GENERATED -
// never hand-edit those files.

const Path = require('path')

const { Api } = require('@voxgig/build')

const root = Path.join(__dirname, '..', '..')

module.exports = async function(model, build) {
  await Api.api_gen(model, { root })
}
