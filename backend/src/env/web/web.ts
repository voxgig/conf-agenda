
// Local web runner: the local in-memory backend plus an HTTP layer for
// the SPA - express serving the frontend dist, the model, and a single seneca
// gateway endpoint (/seneca) that the browser-side Seneca bus posts
// messages to (seneca-browser fetch transport). Cookie auth via
// @seneca/gateway-auth (express_cookie): signin sets the todo-auth
// cookie, after which the gateway attaches the principal so @seneca/owner
// scopes todos per user.
//
// Predefined users are seeded at startup (local testing only).

import Path from 'node:path'

import Express from 'express'
import CookieParser from 'cookie-parser'

import Seneca from 'seneca'
import { Local, context, devtools } from '@voxgig/system'

import { basic, base } from '../shared/basic'
import { seedDemo } from '../shared/seed'
import { apiHandler } from './api'

import Pkg from '../../../package.json'
import Model from '../../../model/model.json'


const PORT = parseInt(process.env.PORT || '', 10) ||
  (Model as any).main.conf.port.backend

// Predefined users seeded at startup (local testing only). Edit freely.
const USERS = [
  {
    "name": "Alice Example",
    "email": "alice@example.com",
    "password": "alice-pass-01"
  },
  {
    "name": "Bob Example",
    "email": "bob@example.com",
    "password": "bob-pass-01"
  }
]


run()


async function run() {
  const { deep } = Seneca.util

  const seneca = Seneca(deep(base.seneca, { tag: 'conf-agenda-web' }))

  // Runtime context: model/pkg/env/stage/srvname. env is 'web' - this IS
  // the web environment entry. It reported 'local' before context()
  // existed, which no longer matched the entry it was generated for.
  context(seneca, Model, Pkg, { env: 'web' })

  // Dev-only behaviour, from the model: seneca.test() and the @seneca/repl
  // dev REPL -   npx seneca-repl telnet://localhost:<conf.port.repl>
  //
  // Declared in main.conf.dev, overridable per environment in
  // main.env.web.dev, and at runtime with SENECA_TEST / SENECA_REPL /
  // SENECA_REPL_PORT. Both default to OFF, so this entry only gets them if
  // the model asks.
  devtools(seneca, Model, { env: 'web' })

  basic(seneca)

  seneca
    .use('gateway', {
      // THE BROWSER SURFACE. Only aim:web is reachable from a browser:
      // every message the SPA may send is declared in the model as an
      // aim:web PROXY that forwards to the real service message. Service
      // namespaces (aim:auth, aim:ent, ...) stay internal, so a browser
      // cannot post one directly. API-key clients have their own proxy
      // layer (aim:api behind the REST router, see ./api.ts).
      allow: { 'aim:web': true },
    })
    .use('gateway-express', {
      // gateway-express sets/clears the auth cookie when a result carries
      // gateway$.auth (see web_signin_user / web_signout_user). Cookie
      // attributes use the plugin defaults (httpOnly, sameSite).
      auth: {
        token: {
          name: 'conf-agenda-auth',
        },
      },
    })
    .use('gateway-auth', {
      spec: {
        express_cookie: {
          active: true,
          token: {
            name: 'conf-agenda-auth',
          },
          user: {
            auth: true,
            require: false,
          },
        },
      },
    })

  seneca.use(Local, {
    srv: {
      folder: __dirname + '/../../../dist/srv',
    },
  })

  await seneca.ready()

  // Seed the predefined users (idempotent per boot: in-memory store).
  const usersByEmail: Record<string, any> = {}
  for (const u of USERS) {
    const res = await seneca.post('sys:user,register:user', u)
    if (!res.ok) {
      console.log('SEED-USER-FAILED', u.email, res.why)
    }
    const got = await seneca.post('sys:user,get:user', { email: u.email })
    if (got.ok && got.user) {
      usersByEmail[u.email] = got.user
    }
  }

  // Seed demo projects/todolists/items (collaborative, one shared project).
  await seedDemo(seneca, usersByEmail)

  const app = Express()
  // The frontend folder is a sibling of backend/; from dist/env/local go
  // up to the project root, then into its dist. The folder name comes from
  // the model (env web `dir`, default 'web'), so it stays in step if the
  // project renames it.
  const webdist = Path.join(
    __dirname, '..', '..', '..', '..', 'web', 'dist')

  app
    .use(Express.json())
    .use(new (CookieParser as any)())
    .post('/seneca', seneca.export('gateway-express/handler'))

  // The strict-JSON REST API (model main.api), if active. Mounted with
  // use() so req.path inside the handler is relative to the prefix.
  const apiconf = (Model as any).main.api
  if (apiconf && false !== apiconf.active) {
    app.use(apiconf.prefix || '/api', apiHandler(seneca, Model))
  }

  // THE PUBLIC AGENDA PATH. Anonymous by design (SPEC 9.1): the embed runs on
  // a third party's page and cannot carry credentials, and a calendar client
  // subscribing to a feed carries none either.
  //
  // Everything here reads the published SNAPSHOT through aim:agenda,* - never
  // a live row - so draft and private content is not filtered out on this
  // path, it was never written into what this path reads.
  //
  // The URL shape matches what the embed defaults to
  // (/agenda/<org>/<conference>.json), so pointing <conf-agenda> at a
  // self-hosted backend is a host swap rather than a different route.
  app.get('/agenda/:org/:slug.:ext', async (req: any, res: any) => {
    const { org, slug, ext } = req.params

    if ('json' === ext) {
      const out = await seneca.post('aim:agenda,get:agenda', { org_id: org, slug })
      if (!out.ok) return res.status(404).type('application/json').send({ ok: false, why: out.why })
      return res
        .type('application/json')
        // Public, cacheable, and revalidated often enough for a day-of change
        // to land (SPEC 21 Q3: snapshot plus short-TTL revalidation).
        .set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
        .set('Access-Control-Allow-Origin', '*')
        .send(out.agenda_json)
    }

    if ('ics' === ext || 'csv' === ext) {
      const out = await seneca.post('aim:agenda,get:feed', { org_id: org, slug, format: ext })
      if (!out.ok) return res.status(404).type('text/plain').send(out.why)
      return res
        .type(out.content_type)
        .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
        .set('Access-Control-Allow-Origin', '*')
        // inline, not attachment: a calendar client subscribing to the URL
        // should read it, not download it.
        .set('Content-Disposition', 'inline; filename="' + out.filename + '"')
        .send(out.body)
    }

    return res.status(404).type('text/plain').send('unknown format: ' + ext)
  })

  app
    .get('/model.json',
      (_req: any, res: any) => res.sendFile(
        Path.join(__dirname, '..', '..', '..', 'model', 'model.json')))
    .use(Express.static(webdist))
    .listen(PORT)

  console.log('conf-agenda-web started', {
    port: PORT,
    users: USERS.map((u) => u.email),
    version: Pkg.version,
  })
}
