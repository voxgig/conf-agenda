// The strict-JSON REST API endpoint (model main.api). Maps
//
//   GET    <prefix>/<version>/<zone>/<name>          -> list   (query -> q)
//   GET    <prefix>/<version>/<zone>/<name>/<id>     -> load
//   POST   <prefix>/<version>/<zone>/<name>          -> create
//   PUT    <prefix>/<version>/<zone>/<name>/<id>     -> update
//   DELETE <prefix>/<version>/<zone>/<name>/<id>     -> remove
//
// onto aim:api,on:ent messages (src/srv/api/on_ent.ts). Uniform semantic
// paths and result shapes so an SDK can be generated (sdkgen); the
// OpenAPI spec is generated from the model (gen/api/openapi.json).
//
// Authentication: API access keys - Authorization: Bearer vk_... - looked
// up by sha-256 hash against sys/apikey and resolved to the owning user,
// which becomes the request principal (so project-membership access
// applies exactly as in the web app).

import Crypto from 'node:crypto'
import Path from 'node:path'

// Result 'why' -> HTTP status.
const STATUS: Record<string, number> = {
  'not-authenticated': 401,
  'forbidden': 403,
  'unknown-entity': 404,
  'not-found': 404,
  'unknown-op': 405,
  'read-only': 405,
  'invalid-data': 400,
  'project-required': 400,
  'invalid-args': 400,
}

export function apiHandler(seneca: any, model: any) {
  const api = (model.main && model.main.api) || {}
  const version = api.version || 'v1'

  return async function handle(req: any, res: any) {
    res.type('application/json')

    try {
      // The generated OpenAPI spec (unauthenticated; from gen/api/).
      if ('GET' === req.method && '/openapi.json' === req.path) {
        return res.sendFile(Path.join(
          __dirname, '..', '..', '..', 'gen', 'api', 'openapi.json'))
      }
      // The same spec as YAML - the format most codegen/SDK tools want.
      if ('GET' === req.method && '/openapi.yaml' === req.path) {
        res.type('application/yaml')
        return res.sendFile(Path.join(
          __dirname, '..', '..', '..', 'gen', 'api', 'openapi.yaml'))
      }

      // Path (relative to the mount prefix): /<version>/<zone>/<name>[/<id>]
      const parts = String(req.path || '').split('/').filter((p: string) => '' !== p)
      if (version !== parts[0] || parts.length < 3 || 4 < parts.length) {
        return fail(res, 404, 'not-found', 'unknown route')
      }
      const ent = parts[1] + '/' + parts[2]
      const id = parts[3]

      const user = await authenticate(seneca, req)
      if (null == user) {
        return fail(res, 401, 'not-authenticated',
          'provide a valid API key: Authorization: Bearer <key>')
      }

      const method = String(req.method || 'GET').toUpperCase()
      let op: string | null = null
      let body = undefined

      if ('GET' === method) {
        op = null == id ? 'list' : 'load'
      }
      else if ('POST' === method && null == id) {
        op = 'create'
        body = req.body
      }
      else if ('PUT' === method && null != id) {
        op = 'update'
        body = req.body
      }
      else if ('DELETE' === method && null != id) {
        op = 'remove'
      }
      if (null == op) {
        return fail(res, 405, 'unknown-op', 'method not supported on this path')
      }

      const out = await seneca.post('aim:api,on:ent', {
        op,
        ent,
        id,
        data: body,
        q: 'list' === op ? Object.assign({}, req.query) : undefined,
        custom$: { principal: { user } },
      })

      if (!out.ok) {
        return fail(res, STATUS[out.why] || 500, out.why || 'failed',
          out.message, out.details)
      }

      const status = 'create' === op ? 201 : 200
      const result: any = {}
      if (null != out.items) {
        result.items = out.items
      }
      if (null != out.item) {
        result.item = out.item
      }
      if ('remove' === op) {
        result.ok = true
        result.id = id
      }
      return res.status(status).send(result)
    }
    catch (e: any) {
      return fail(res, 500, 'error', 'internal error')
    }
  }
}

function fail(res: any, status: number, code: string, message?: string, details?: any) {
  const error: any = { code }
  if (message) {
    error.message = message
  }
  if (details) {
    error.details = details
  }
  return res.status(status).send({ error })
}

// Resolve the Bearer API key to its owning user (the principal), or null.
async function authenticate(seneca: any, req: any): Promise<any> {
  const header = String(req.headers['authorization'] || '')
  const m = header.match(/^Bearer\s+(\S+)$/i)
  if (null == m) {
    return null
  }
  const hash = Crypto.createHash('sha256').update(m[1]).digest('hex')
  const keys = await seneca.entity('sys/apikey').list$({ hash })
  const key = keys.find((k: any) => !k.revoked)
  if (null == key) {
    return null
  }
  const user = await seneca.entity('sys/user').load$(key.user_id)
  if (null == user) {
    return null
  }
  const d = user.data$(false)
  delete d.pass
  delete d.salt
  return d
}
