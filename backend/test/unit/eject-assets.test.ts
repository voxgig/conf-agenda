import { describe, test } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Os from 'node:os'
import Path from 'node:path'

// Top-level on purpose: `npm test` globs dist-test/unit/*.test.js one level
// only, so a test under unit/lib/ would never run in the gate.

const { makeAssetCheck } = require('../../dist/lib/assets.js')
const {
  vendorAssets, rewriteAgenda, collectAssets, AssetRefusal,
} = require('../../dist/lib/eject/assets.js')

// A real directory, because containment is about what the FILESYSTEM says,
// and the symlink case cannot be faked with a stub.
const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'cag-eject-assets-'))
Fs.writeFileSync(Path.join(root, 'ada.jpg'), 'ada-bytes')
const outside = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'cag-eject-outside-'))
Fs.writeFileSync(Path.join(outside, 'secrets.txt'), 'secret-bytes')
// A symlink INSIDE the root pointing outside it: lexically inside, really out.
Fs.symlinkSync(Path.join(outside, 'secrets.txt'), Path.join(root, 'sneaky.jpg'))

const REMOTE = 'https://cdn.example.test/people/grace.png?v=2'

/** A recording fake: never the network (node's egress is blocked here, and a
 *  unit test should not depend on someone else's host anyway). */
function fakeFetch(bodies: Record<string, string | Error>) {
  const calls: string[] = []
  const fetch = async (url: string) => {
    calls.push(url)
    const body = bodies[url]
    if (body instanceof Error) throw body
    if (null == body) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(body).buffer }
  }
  return { fetch, calls }
}

function deps(bodies: Record<string, string | Error> = {}) {
  const reads: string[] = []
  const fake = fakeFetch(bodies)
  return {
    reads,
    calls: fake.calls,
    deps: {
      check: makeAssetCheck(root),
      read: (p: string) => {
        reads.push(p)
        return Fs.readFileSync(Path.resolve(root, p))
      },
      fetch: fake.fetch,
    },
  }
}

const agenda = (...photos: any[]) => ({
  conference: { slug: 'c', w_site: 'https://www.nodeconf.eu/' },
  speakers: photos.map((photo, i) => ({
    id: 'sp' + i, name: 'S' + i, photo, w_site: 'https://speaker' + i + '.example.test/',
  })),
  sessions: [{ id: 's1', w_video: 'https://video.example.test/1', w_deck: 'https://deck.example.test/1' }],
})

async function refusal(p: Promise<any>) {
  try {
    await p
  } catch (err) {
    assert.ok(err instanceof AssetRefusal, 'refused with an AssetRefusal: ' + err)
    return err as any
  }
  assert.fail('expected the eject to refuse')
}

describe('eject-assets', () => {
  test('eject-assets: collects photos, and not the links a reader follows', () => {
    const a = agenda('ada.jpg', REMOTE, 'data:image/png;base64,AAAA', '', 'ada.jpg')
    // Known-present and known-absent: each photo once, no data: URI, and none
    // of w_site, w_video, w_deck, which are links and not files the page loads.
    assert.deepEqual(collectAssets(a), ['ada.jpg', REMOTE])
  })

  test('eject-assets: a local asset is vendored under assets/ and rewritten relative', async () => {
    const d = deps()
    const a = agenda('ada.jpg')
    const { files, rewrites } = await vendorAssets(a, d.deps)

    const path = rewrites.get('ada.jpg')
    assert.match(path, /^assets\/[0-9a-f]{16}\.jpg$/)
    assert.equal(String(files.get(path)), 'ada-bytes')
    assert.deepEqual([...files.keys()], [path])

    const out = rewriteAgenda(a, rewrites)
    assert.equal(out.speakers[0].photo, path)
    assert.equal(a.speakers[0].photo, 'ada.jpg', 'the input is left as it was')
    assert.equal(out.conference.w_site, 'https://www.nodeconf.eu/', 'content links survive')
  })

  test('eject-assets: a remote URL is fetched through the injected fetcher and vendored', async () => {
    const d = deps({ [REMOTE]: 'grace-bytes' })
    const { files, rewrites } = await vendorAssets(agenda(REMOTE), d.deps)

    assert.deepEqual(d.calls, [REMOTE], 'fetched once, through the fake')
    const path = rewrites.get(REMOTE)
    // The extension comes from the URL's path, never its query.
    assert.match(path, /^assets\/[0-9a-f]{16}\.png$/)
    assert.equal(String(files.get(path)), 'grace-bytes')
  })

  test('eject-assets: a fetch that throws refuses, naming the URL', async () => {
    const d = deps({ [REMOTE]: new Error('ECONNREFUSED') })
    const err = await refusal(vendorAssets(agenda('ada.jpg', REMOTE), d.deps))
    assert.equal(err.why, 'asset-unavailable')
    assert.equal(err.asset, REMOTE)
    assert.ok(err.message.includes(REMOTE), err.message)
    assert.match(err.message, /ECONNREFUSED/)
  })

  test('eject-assets: a fetch answering non-2xx refuses, naming the URL', async () => {
    const d = deps({})
    const err = await refusal(vendorAssets(agenda(REMOTE), d.deps))
    assert.equal(err.asset, REMOTE)
    assert.match(err.message, /HTTP 404/)
  })

  test('eject-assets: a missing local asset refuses, naming it', async () => {
    const err = await refusal(vendorAssets(agenda('missing.jpg'), deps().deps))
    assert.equal(err.why, 'asset-unavailable')
    assert.equal(err.asset, 'missing.jpg')
  })

  test('eject-assets: a symlink inside the root pointing outside it refuses, uncopied', async () => {
    assert.ok(Fs.lstatSync(Path.join(root, 'sneaky.jpg')).isSymbolicLink(), 'the fixture is a symlink')
    const d = deps()
    const err = await refusal(vendorAssets(agenda('sneaky.jpg'), d.deps))
    assert.equal(err.why, 'asset-escapes-root')
    assert.equal(err.asset, 'sneaky.jpg')
    assert.deepEqual(d.reads, [], 'the outside file was never read')
  })

  test('eject-assets: a climbing path and a non-http scheme refuse', async () => {
    const climb = await refusal(vendorAssets(agenda('../../etc/passwd'), deps().deps))
    assert.equal(climb.why, 'asset-escapes-root')
    const ftp = await refusal(vendorAssets(agenda('ftp://files.example.test/a.jpg'), deps().deps))
    assert.equal(ftp.why, 'asset-unavailable')
  })
})
