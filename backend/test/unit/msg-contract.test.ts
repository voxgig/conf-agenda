/* The message-declaration contract (PLATFORM 1.4).
 *
 * PLATFORM 1.4 assigns three checks to model build: no two definitions
 * resolving to the same action file, an `inverse` must carry a `pat`, and that
 * `pat` must match a declared definition. @voxgig/model 11.0.0 implements
 * NONE of them - only duplicate-pattern detection - so they live here.
 *
 * And a fourth, which matters more than any of them: msg.aon says "only
 * declare a message whose action file EXISTS", and nothing enforces it.
 * @seneca/reload swallows MODULE_NOT_FOUND, registers a watcher and returns a
 * wrapper, so a declared-but-unimplemented message BOOTS CLEANLY, passes the
 * whole suite, and throws the first time somebody posts it - in the browser,
 * in front of an organiser.
 *
 * TOP-LEVEL ON PURPOSE. `npm test` globs dist-test/unit/*.test.js, one level
 * only: a nested file never runs. test/unit/env/web/surface.test.ts is the
 * cautionary example - it is nested, so it has never run, and run by hand it
 * throws because it still reads main.msg.aim on what is now a list.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Model from '../../model/model.json'

const MSG: any[] = (Model as any).main.msg

const pairs = (m: any): [string, string][] =>
  m.pat.map((p: any) => Object.entries(p)[0] as [string, string])

const pattern = (m: any) => pairs(m).map(([k, v]) => k + ':' + v).join(',')

/**
 * The service that owns a definition's action file. `aim:web,on:cag,...`
 * lives in src/srv/cag beside the message it proxies - the proxy is the cag
 * service's, not a service of its own.
 */
function srvOf(m: any): string {
  const p = pairs(m)
  const on = p.find(([k]) => 'on' === k)
  if (on) return on[1]
  const aim = p.find(([k]) => 'aim' === k)
  return aim ? aim[1] : ''
}

/** Last pattern pair -> `<verb>_<noun>`, with `file` overriding (PLATFORM 1.4). */
function fileOf(m: any): string {
  if (m.file) return String(m.file).replace(/^\.\//, '')
  const p = pairs(m)
  const [verb, noun] = p[p.length - 1]
  return verb + '_' + noun
}

const SRC = Path.join(process.cwd(), 'src', 'srv')

/** Services this project deliberately does not declare (docs/decisions). */
const UNDECLARED = ['ent', 'thing']


describe('the message contract', () => {
  test('the walk finds definitions at all', () => {
    // The guard against a vacuous pass: everything below iterates MSG, so if
    // main.msg ever changes shape this fails first and loudly instead of
    // every assertion passing over an empty list.
    assert.ok(Array.isArray(MSG), 'main.msg is a list (PLATFORM 1.4)')
    assert.ok(20 < MSG.length, 'suspiciously few definitions: ' + MSG.length)
  })

  test('every declared message has an action file that EXISTS', () => {
    // The check @seneca/reload's swallowed MODULE_NOT_FOUND removes.
    const missing: string[] = []
    for (const m of MSG) {
      const srv = srvOf(m)
      if (UNDECLARED.includes(srv)) continue
      const file = Path.join(SRC, srv, fileOf(m) + '.ts')
      if (!Fs.existsSync(file)) missing.push(pattern(m) + ' -> ' + file)
    }
    assert.deepEqual(missing, [], 'declared without an action file:\n' + missing.join('\n'))
  })

  test('known-ABSENT: a message with no action file would be caught', () => {
    // Proves the test above can fail. A pattern nobody has implemented must
    // resolve to a path that is not there - if this ever passes, the check
    // above is asserting nothing.
    const invented = { pat: [{ aim: 'cag' }, { frobnicate: 'segment' }] }
    const file = Path.join(SRC, srvOf(invented), fileOf(invented) + '.ts')
    assert.equal(Fs.existsSync(file), false, 'the fixture for this test now exists')
  })

  test('no two definitions in one service derive the same action file', () => {
    // The collision `file` exists to settle - every aim:web proxy shares its
    // last pair with the message it forwards to.
    const seen = new Map<string, string>()
    for (const m of MSG) {
      const key = srvOf(m) + '/' + fileOf(m)
      const first = seen.get(key)
      assert.equal(first, undefined,
        'two definitions resolve to ' + key + ': ' + first + ' and ' + pattern(m))
      seen.set(key, pattern(m))
    }
  })
})


describe('the undo contract', () => {
  const withInverse = () => MSG.filter((m: any) => null != m.inverse)

  test('known-PRESENT: the segment intents declare their inverses', () => {
    // If this list ever empties, every assertion below passes vacuously.
    const named = withInverse().map(pattern).sort()
    assert.ok(0 < named.length, 'no definition declares an inverse')
    assert.ok(named.includes('aim:cag,move:segment'),
      'move:segment is the canonical undoable intent: ' + JSON.stringify(named))
  })

  test('every inverse carries a pat, and that pat is DECLARED', () => {
    const all = MSG.map(pattern)
    for (const m of withInverse()) {
      const inv = m.inverse
      assert.ok(Array.isArray(inv.pat) && 0 < inv.pat.length,
        pattern(m) + ' declares an inverse with no pat (PLATFORM 1.4)')
      const target = pattern({ pat: inv.pat })
      assert.ok(all.includes(target),
        pattern(m) + ' inverts to ' + target + ', which is not declared')
    }
  })

  test('an inverse is reachable from the browser, or it is not an undo', () => {
    // The undo log posts the inverse like any other edit, and the browser can
    // only post aim:web. An inverse with no proxy is an undo affordance that
    // fails silently the first time somebody presses `u`.
    const all = MSG.map(pattern)
    for (const m of withInverse()) {
      const [, ...rest] = pairs({ pat: m.inverse.pat })
      const target = pattern({ pat: m.inverse.pat })
      const srv = srvOf({ pat: m.inverse.pat })
      const proxy = 'aim:web,on:' + srv + ',' +
        rest.map(([k, v]) => k + ':' + v).join(',')
      assert.ok(all.includes(proxy),
        target + ' is an inverse with no aim:web proxy (' + proxy + ')')
    }
  })

  test('known-ABSENT: remove:segment declares no inverse, and must not', () => {
    // PLATFORM 1.4: "a definition without `inverse` is not undoable, and the
    // UI must show it that way". Restoring a deleted subtree is not an
    // ordinary edit, so this absence is the design - the grid reads it and
    // does not offer `u`.
    const rm = MSG.find((m: any) => 'aim:cag,remove:segment' === pattern(m))
    assert.ok(rm, 'remove:segment is not declared')
    assert.equal(rm.inverse, undefined,
      'remove:segment grew an inverse - was that deliberate?')
  })
})


describe('the intents take no tenancy from the payload', () => {
  const FORBIDDEN = ['org_id', 'owner_id', 'top_id']

  const intents = () => MSG.filter((m: any) =>
    pairs(m).some(([k]) => 'aim' === k) && null != m.params)

  test('known-PRESENT: the walk found messages with params', () => {
    assert.ok(5 < intents().length, 'too few messages carry params to be walking anything')
  })

  /**
   * THE ONE EXCEPTION, and it is the public read path (SPEC 9.1).
   *
   * aim:agenda,get:agenda is the single unauthenticated message: the embed
   * runs on a third party's page and cannot carry credentials, so there is no
   * principal and no stored row to take an org from - the caller HAS to name
   * one. That is safe only because of what these two messages are: reads,
   * served from the published KV snapshot, which never contains a draft, a
   * private fixture or a speaker email. They cannot write, and they cannot
   * see anything that is not already public.
   *
   * The list is asserted to be exactly this, so a third entry fails here
   * first and has to be argued for rather than absorbed.
   */
  const PUBLIC_READS = ['aim:agenda,get:agenda', 'aim:agenda,get:feed']

  test('no declared message names a tenancy field in its params', () => {
    // The STRUCTURAL half of "tenancy comes from the stored row": a closed
    // shape with no org_id has no key to send. The other half is the action
    // reading it from the loaded row (srv/cag/intent_util.ts).
    //
    // This was a real flaw in todo-app, and SPEC 13.2 says: do not
    // reintroduce it.
    for (const m of MSG) {
      if (null == m.params) continue
      if (PUBLIC_READS.includes(pattern(m))) continue
      for (const f of FORBIDDEN) {
        assert.equal(m.params[f], undefined,
          pattern(m) + ' accepts ' + f + ' from the caller')
      }
    }
  })

  test('the exception list is exactly the public read path', () => {
    // A new entry here means somebody has taken tenancy from a payload. It
    // should cost a failing test and a conversation, not a quiet edit.
    const naming = MSG
      .filter((m: any) => null != m.params &&
        FORBIDDEN.some((f) => undefined !== m.params[f]))
      .map(pattern)
      .sort()
    assert.deepEqual(naming, PUBLIC_READS.slice().sort())
  })

  test('and neither public read can write', () => {
    // The reason the exception is safe at all. Both are `get:`, both are
    // served from the snapshot, and nothing in aim:agenda mutates.
    for (const p of PUBLIC_READS) {
      assert.match(p, /,get:/, p + ' is in the tenancy exception list but is not a read')
    }
  })
})
