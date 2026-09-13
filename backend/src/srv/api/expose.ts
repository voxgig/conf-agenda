// Which entities the REST API exposes (model main.api). Application
// entities are exposed by default; the sys zone never is; per-entity
// overrides live under main.api.ent.
export function exposedCanon(model: any, canon: string): boolean {
  const [zone, name] = String(canon).split('/')
  const def = model && model.main && model.main.ent &&
    model.main.ent[zone] && model.main.ent[zone][name]
  if (null == def || 'sys' === zone) {
    return false
  }
  const api = (model.main.api || {})
  if (false === api.active) {
    return false
  }
  const conf = (api.ent || {})[canon]
  return !(conf && false === conf.active)
}

// All exposed canons, sorted (used by generators and get:info).
export function exposedCanons(model: any): string[] {
  const out: string[] = []
  const zones = (model && model.main && model.main.ent) || {}
  for (const zone of Object.keys(zones)) {
    for (const name of Object.keys(zones[zone])) {
      const canon = zone + '/' + name
      if (exposedCanon(model, canon)) {
        out.push(canon)
      }
    }
  }
  return out.sort()
}
