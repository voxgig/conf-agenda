import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'

import Model from '../../model/model.json'

// The deploy targets in the generated wrangler config. Each target names its
// own account and KV namespace; the top level names no account and keeps the
// local placeholder, so a deploy that names no target is refused at upload
// rather than publishing anywhere. Read as text: no TOML parser is installed.

const ROOT = process.cwd()
const CONFIG = 'gen/env/cloudflare/wrangler.toml'
const CF: any = (Model as any).main.env.cloudflare

// Splits a wrangler.toml into its tables, keyed by header ('' is the top
// level). An array-of-tables header ([[x]]) keys as 'x' too; this file has at
// most one of each. A bare boolean is kept as its text.
function tables(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { '': {} }
  let cur = out['']
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if ('' === line || line.startsWith('#')) continue
    const head = /^\[\[?([^\]]+)\]\]?$/.exec(line)
    if (head) {
      cur = out[head[1]] = {}
      continue
    }
    const kv = /^([A-Za-z_]+)\s*=\s*(?:"([^"]*)"|(true|false))$/.exec(line)
    if (kv) cur[kv[1]] = kv[2] ?? kv[3]
  }
  return out
}

const T = tables(Fs.readFileSync(Path.join(ROOT, CONFIG), 'utf8'))

describe('wrangler-config', () => {
  for (const [target, name] of [
    ['own', 'conf-agenda-own'],
    ['voxgig', 'conf-agenda'],
  ]) {
    test(`[env.${target}] names its account, its Worker and its namespace`, () => {
      const env = T['env.' + target]
      assert.ok(env, `no [env.${target}] table in ${CONFIG}`)
      assert.equal(env.account_id, CF[target + '_account_id'])
      assert.equal(env.name, name)

      const kv = T[`env.${target}.kv_namespaces`]
      assert.ok(kv, `no [[env.${target}.kv_namespaces]] in ${CONFIG}`)
      assert.equal(kv.binding, 'AGENDA')
      assert.equal(kv.id, CF[target + '_kv_id'])
    })
  }

  test('the two targets are different accounts and namespaces', () => {
    assert.notEqual(T['env.own'].account_id, T['env.voxgig'].account_id)
    assert.notEqual(
      T['env.own.kv_namespaces'].id,
      T['env.voxgig.kv_namespaces'].id,
    )
  })

  test('[env.voxgig] keeps agenda.voxgig.com as a Custom Domain', () => {
    const route = T['env.voxgig.routes']
    assert.ok(route, `no [[env.voxgig.routes]] in ${CONFIG}`)
    assert.equal(route.pattern, CF.voxgig_domain)
    assert.equal(route.pattern, 'agenda.voxgig.com')
    assert.equal(route.custom_domain, 'true')
    assert.equal(T['env.voxgig'].workers_dev, 'false')

    // Known absent: the scratch target serves on workers.dev, with no domain.
    assert.equal(T['env.own.routes'], undefined)
  })

  test('the top level names no account and keeps the local namespace', () => {
    assert.equal(T[''].account_id, undefined)
    assert.equal(T['kv_namespaces'].id, 'agenda-local')
  })

  test('every real deploy script names a target', () => {
    const scripts = JSON.parse(
      Fs.readFileSync(Path.join(ROOT, '../package.json'), 'utf8'),
    ).scripts as Record<string, string>

    const deploys = Object.entries(scripts).filter(
      ([, cmd]) => /wrangler deploy/.test(cmd) && !/--dry-run/.test(cmd),
    )

    // Known present: both targets have a script.
    assert.deepEqual(deploys.map(([k]) => k).sort(), ['deploy', 'deploy:own'])

    for (const [key, cmd] of deploys) {
      assert.match(cmd, /--env (own|voxgig)\b/, `${key} names no --env`)
    }

    // Known absent: the dry-run is not a deploy and names no target.
    assert.doesNotMatch(scripts.build, /--env/)
  })
})
