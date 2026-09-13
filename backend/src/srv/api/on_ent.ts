import { exposedCanon } from './expose'

// aim:api,on:ent  { op, ent:'zone/name', id?, data?, q? }
// One REST operation on one entity. Validates the entity is exposed by
// the API (model main.api) and the data against the GENERATED entity
// shapes (valid_gen.ts - strict: unknown fields are rejected), then
// delegates to the generic entity service (aim:ent,cmd:*), which
// enforces membership access. The caller's principal (resolved from the
// API key by the router) propagates via meta.custom.
module.exports = function make_on_ent() {
  const makeShapes = require('./valid_gen')
  let shapes: any = null

  return async function on_ent(this: any, msg: any) {
    const seneca = this
    const model = seneca.context.model

    shapes = shapes || makeShapes(seneca.util.Gubu)

    const op = String(msg.op || '')
    const canon = String(msg.ent || '')

    if (!exposedCanon(model, canon)) {
      return { ok: false, why: 'unknown-entity' }
    }

    if ('list' === op) {
      return relay(await seneca.post('aim:ent,cmd:list',
        { ent: canon, q: coerceQ(model, canon, msg.q || {}) }))
    }

    if ('load' === op) {
      const res = await seneca.post('aim:ent,cmd:load', { ent: canon, id: msg.id })
      if (res.ok && null == res.item) {
        return { ok: false, why: 'not-found' }
      }
      return relay(res)
    }

    if ('create' === op || 'update' === op) {
      const shape = shapes[canon] && shapes[canon][op]
      if (null == shape) {
        return { ok: false, why: 'unknown-entity' }
      }
      let data = null == msg.data ? {} : msg.data
      try {
        data = shape(data)
      }
      catch (e: any) {
        if ('shape' !== e.code) {
          throw e
        }
        return {
          ok: false, why: 'invalid-data', message: e.message,
          details: (e.props || []).map((p: any) =>
            ({ path: p.path, what: p.what, type: p.type })),
        }
      }
      if ('update' === op) {
        const existing = await seneca.post('aim:ent,cmd:load', { ent: canon, id: msg.id })
        if (!existing.ok || null == existing.item) {
          return { ok: false, why: existing.ok ? 'not-found' : existing.why }
        }
        data = Object.assign({}, existing.item.data$ ?
          existing.item.data$(false) : existing.item, data, { id: msg.id })
      }
      return relay(await seneca.post('aim:ent,cmd:save', { ent: canon, item: data }))
    }

    if ('remove' === op) {
      const existing = await seneca.post('aim:ent,cmd:load', { ent: canon, id: msg.id })
      if (!existing.ok || null == existing.item) {
        return { ok: false, why: existing.ok ? 'not-found' : existing.why }
      }
      return relay(await seneca.post('aim:ent,cmd:remove', { ent: canon, id: msg.id }))
    }

    return { ok: false, why: 'unknown-op' }
  }
}

// Pass the ent service result through, stripping entity instances down
// to plain data (strict JSON out).
function relay(res: any) {
  if (null == res || !res.ok) {
    return res || { ok: false, why: 'failed' }
  }
  const out: any = { ok: true }
  if (null != res.item) {
    out.item = plain(res.item)
  }
  if (null != res.list) {
    out.items = res.list.map(plain)
  }
  if (null != res.id) {
    out.id = res.id
  }
  return out
}

function plain(item: any) {
  return item && 'function' === typeof item.data$ ? item.data$(false) : item
}

// HTTP query values arrive as strings; coerce them to the field's kind
// so exact-match filtering works (done=true, t_c=123, ...).
function coerceQ(model: any, canon: string, q: any) {
  const [zone, name] = canon.split('/')
  const fields = (model.main.ent[zone][name] || {}).field || {}
  const out: any = {}
  for (const k of Object.keys(q)) {
    const kind = fields[k] && fields[k].kind
    let v: any = q[k]
    if ('Number' === kind) {
      v = Number(v)
    }
    else if ('Boolean' === kind) {
      v = 'false' !== v && false !== v
    }
    out[k] = v
  }
  return out
}
