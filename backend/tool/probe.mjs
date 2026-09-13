import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const Seneca = require('seneca')
const Model = require('../model/model.json')
const { basic } = require('../dist/env/shared/basic.js')
const { Local, context } = require('@voxgig/system')
const Pkg = require('../package.json')

const s = Seneca({ legacy: false, timeout: 5555 })
context(s, Model, Pkg, { env: 'web' })
s.test()
basic(s)
s.use(Local, { srv: { folder: new URL('../dist/srv', import.meta.url).pathname } })
await s.ready()

const pats = s.list().map((p) => s.util.pattern(p)).filter((p) => /aim:/.test(p))
console.log('aim: patterns registered:')
for (const p of pats.sort()) console.log('  ' + p)
process.exit(0)
