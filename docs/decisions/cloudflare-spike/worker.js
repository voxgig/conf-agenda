// Spike Q3: per-request Seneca + close() in finally — the night-sky-logbook fix.
// Clean isolate, 10 consecutive requests.
import Seneca from 'seneca'
import Entity from 'seneca-entity'
import Promisify from 'seneca-promisify'

let n = 0

async function getSeneca() {
  // Function-form plugins only: string form hits use-plugin's dynamic
  // module.require, which does not exist in a bundled Worker.
  const s = Seneca({ legacy: false, timeout: 5000 })
    .use(Promisify)
    .use(Entity)
    .use(function spike() {
      this.message('spike:ping', async function (msg) { return { ok: true, n: msg.n } })
    })
  await s.ready()
  return s
}

export default {
  async fetch() {
    const req = ++n
    const t0 = Date.now()
    let seneca = null
    try {
      seneca = await getSeneca()
      const buildMs = Date.now() - t0
      const t1 = Date.now()
      const r = await seneca.post('spike:ping', { n: req })
      return Response.json({ req, buildMs, actMs: Date.now() - t1, result: r })
    } catch (err) {
      return Response.json({ req, error: String(err?.message || err) }, { status: 500 })
    } finally {
      if (seneca) await seneca.close()   // <-- the fix
    }
  },
}
