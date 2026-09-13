// Shared helper for the apikey actions (not an action file).
// Never expose the stored hash.
export function publicKey(item: any) {
  if (null == item) {
    return null
  }
  const d = 'function' === typeof item.data$ ? item.data$(false) : item
  return { id: d.id, name: d.name, prefix: d.prefix, revoked: !!d.revoked, t_c: d.t_c }
}
