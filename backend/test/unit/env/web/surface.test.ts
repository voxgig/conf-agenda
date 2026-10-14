import { test, describe } from 'node:test'
import assert from 'node:assert'


// THE GATEWAY ALLOW-LIST.
//
// This file is create-once @voxgig/build output (env/web/web_gen.js). Its
// model-walk tests read the message definitions as a map keyed by aim, which
// they have not been since they became a list (PLATFORM 1.4), and they asserted the generic ent
// surface SPEC 9 removed. They are gone: test/unit/browser-surface.test.ts
// walks the list, with known-present and known-absent cases. What stays is
// the one check nothing else makes. Do not delete this file: the next
// model-build writes the generic version back, and that version fails.

describe('browser surface', () => {

  test('the gateway allows aim:web and nothing else', () => {
    const src = require('node:fs').readFileSync(
      __dirname + '/../../../../src/env/web/web.ts', 'utf8')

    // The allow-list is a literal so it can be read off the source and
    // reviewed: no computed expansion over the service list.
    const m = src.match(/allow:\s*\{([^}]*)\}/)
    assert.ok(m, 'gateway allow-list not found')
    const keys = m[1].match(/'([^']+)'/g) || []
    assert.deepStrictEqual(keys, ["'aim:web'"])
  })
})
