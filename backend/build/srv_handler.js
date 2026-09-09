// Generation action: srv_handler. Templates resolve in layers - project
// src/gen/srv_handler.ts (code override), project tm/lambda fragments, then
// @voxgig/build defaults. See: voxgig-system template list|eject|diff.

const Fs = require('fs')
const Path = require('path')

const { EnvLambda } = require('@voxgig/build')

const folder = Path.join(__dirname, '..', 'src', 'handler', 'lambda')
const tm = Path.join(__dirname, '..', 'tm', 'lambda')

module.exports = async function(model, build) {
  Fs.mkdirSync(folder, { recursive: true })

  // Layer 1: compiled project override (src/gen -> dist/gen).
  const custom = Path.join(__dirname, '..', 'src', 'gen', 'srv_handler.ts')
  if (Fs.existsSync(custom)) {
    let mod = null
    try {
      mod = require('../dist/gen/srv_handler.js')
    }
    catch (e) {
      if ('MODULE_NOT_FOUND' !== e.code) {
        throw e
      }
      console.log('srv_handler: src/gen/srv_handler.ts exists but is not ' +
        'compiled - using the default template for this pass; ' +
        'run: npm run build && npm run model-build')
    }
    if (mod) {
      const gen = mod.srv_handler || mod.srv_handler || mod.default
      return gen(model, {
    folder,
    start: 'lambda',
    env: {
      folder: Path.join('..', '..', 'env', 'lambda'),
    },
    lang: 'ts',
    tm,
  })
    }
  }

  await EnvLambda.srv_handler(model, {
    folder,
    start: 'lambda',
    env: {
      folder: Path.join('..', '..', 'env', 'lambda'),
    },
    lang: 'ts',
    tm,
  })
}
