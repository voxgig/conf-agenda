// Generation action: env_gen. Generates deployment artifacts under
// gen/env/<name>/ and (once) runtime entries under src/env/ for each
// environment declared in the model (main: env:). Templates resolve in
// layers - project src/gen/env_gen.ts, project tm/env fragments, then
// @voxgig/build defaults. See: voxgig-system template list|eject|diff.

const Fs = require('fs')
const Path = require('path')

const { EnvGen } = require('@voxgig/build')

const folder = Path.join(__dirname, '..', 'gen', 'env')
const tm = Path.join(__dirname, '..', 'tm', 'env')
const src = Path.join(__dirname, '..', 'src', 'env')
const root = Path.join(__dirname, '..', '..')

module.exports = async function(model, build) {
  Fs.mkdirSync(folder, { recursive: true })

  const custom = Path.join(__dirname, '..', 'src', 'gen', 'env_gen.ts')
  if (Fs.existsSync(custom)) {
    let mod = null
    try {
      mod = require('../dist/gen/env_gen.js')
    }
    catch (e) {
      if ('MODULE_NOT_FOUND' !== e.code) {
        throw e
      }
      console.log('env_gen: src/gen/env_gen.ts exists but is not ' +
        'compiled - using the default template for this pass; ' +
        'run: npm run build && npm run model-build')
    }
    if (mod) {
      const gen = mod.env_gen || mod.default
      return gen(model, { folder, tm, src, root })
    }
  }

  await EnvGen.env_gen(model, { folder, tm, src, root })
}
