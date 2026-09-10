// Generation action: doc_gen. Regenerates the model-derived docs on
// every model-build: docs/reference/{entities,messages,system-map}.md
// (mermaid ER / message-flow / architecture diagrams) and a README.md
// per implemented service under src/srv/. All AUTO-GENERATED - never
// hand-edit those files.

const Path = require('path')

const { Docs } = require('@voxgig/build')

const root = Path.join(__dirname, '..', '..')

module.exports = async function(model, build) {
  await Docs.doc_gen(model, { root })
}
