#!/usr/bin/env node
/* Copy the built <conf-agenda> component into backend/asset/, so an installed
 * CLI carries the component an ejected bundle ships (SPEC 12). An installed
 * CLI has no ../embed/dist to resolve at runtime, which is why this is a
 * build step and not a runtime lookup.
 *
 * The UMD build, never the .mjs: a module script cannot load from a file://
 * URL, and "open index.html from a file:// URL and it works" is the promise.
 *
 * A missing embed build fails LOUDLY: a backend built without it would eject
 * bundles with no component in them.
 */
import Fs from 'node:fs'
import Path from 'node:path'

const HERE = Path.dirname(new URL(import.meta.url).pathname)
const FROM = Path.join(HERE, '../../embed/dist/conf-agenda.umd.cjs')
const TO = Path.join(HERE, '../asset/conf-agenda.js')

if (!Fs.existsSync(FROM)) {
  console.error('copy-embed: no embed build at ' + FROM)
  console.error('copy-embed: run `cd embed && npm run build` first')
  process.exit(1)
}

Fs.mkdirSync(Path.dirname(TO), { recursive: true })
Fs.copyFileSync(FROM, TO)
