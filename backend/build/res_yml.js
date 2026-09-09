// Generation action: res_yml. Templates resolve in layers - project
// src/gen/res_yml.ts (code override), project tm/lambda fragments, then
// @voxgig/build defaults. See: voxgig-system template list|eject|diff.

const Fs = require('fs')
const Path = require('path')

const { EnvLambda } = require('@voxgig/build')

const folder = Path.join(__dirname, '..', 'gen', 'env', 'aws')
const tm = Path.join(__dirname, '..', 'tm', 'lambda')

module.exports = async function(model, build) {
  Fs.mkdirSync(folder, { recursive: true })

  // Layer 1: compiled project override (src/gen -> dist/gen).
  const custom = Path.join(__dirname, '..', 'src', 'gen', 'res_yml.ts')
  if (Fs.existsSync(custom)) {
    let mod = null
    try {
      mod = require('../dist/gen/res_yml.js')
    }
    catch (e) {
      if ('MODULE_NOT_FOUND' !== e.code) {
        throw e
      }
      console.log('res_yml: src/gen/res_yml.ts exists but is not ' +
        'compiled - using the default template for this pass; ' +
        'run: npm run build && npm run model-build')
    }
    if (mod) {
      const gen = mod.resources_yml || mod.res_yml || mod.default
      return gen(model, {
    folder,
    filename: 'res.yml',
    custom: null,
    tm,
  })
    }
  }

  await EnvLambda.resources_yml(model, {
    folder,
    filename: 'res.yml',
    custom: null,
    tm,
  })
}
