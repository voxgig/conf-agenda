//// Shared entity-read helper for the per-entity messages.
////
//// Every read below is scoped to the caller's org. The tenant comes from the
//// STORED row, never from the request payload - taking it from the payload
//// lets a caller name a tenant they belong to, pass the membership check, and
//// read or overwrite a row in someone else's (PLATFORM 1.2; a real flaw in
//// todo-app, pinned by tests there).
////
//// At Stage 1 there is one org and @seneca/owner supplies the scoping, so
//// this is the seam rather than the whole answer: when multi-tenancy goes
//// real at Stage 4 the org resolution moves behind concern:tenant and every
//// action below inherits it without changing.

export type EntRead = {
  ok: boolean
  list?: any[]
  item?: any
  why?: string
}

/**
 * Stable key order, so two identical reads serialise identically (SPEC 17).
 *
 * Deliberately NO field stripping here. C6 - "speaker emails are never
 * public" - is about the PUBLIC path, and it is enforced there structurally:
 * buildAgenda never picks the field up, so it cannot reach agenda.json, the
 * embed, the feeds or an ejected bundle.
 *
 * These reads are authenticated and org-scoped: the organiser owns those
 * emails and needs them, not least because SPEC 16.2's `speaker-no-email`
 * warning is unactionable if the app cannot show which speaker is missing one.
 * Stripping here would look cautious and would quietly break a rule.
 */
function tidy(row: any): any {
  if (null == row) return null
  const out: any = {}
  for (const k of Object.keys(row).sort()) out[k] = row[k]
  return out
}

export function makeList(canon: string) {
  return function (this: any) {
    return async function (this: any, msg: any): Promise<EntRead> {
      const list = await this.entity(canon).list$(msg.q || {})
      return { ok: true, list: list.map((r: any) => tidy(r.data$(false))) }
    }
  }
}

export function makeLoad(canon: string) {
  return function (this: any) {
    return async function (this: any, msg: any): Promise<EntRead> {
      const item = await this.entity(canon).load$(msg.id)
      return null == item
        ? { ok: false, why: 'not-found' }
        : { ok: true, item: tidy(item.data$(false)) }
    }
  }
}

/** A browser proxy: forward to the service message, nothing else. */
export function makeWebProxy(pattern: string, pick: string[] = []) {
  return function (this: any) {
    return async function (this: any, msg: any) {
      const args: any = {}
      for (const k of pick) if (null != msg[k]) args[k] = msg[k]
      return this.post(pattern, args)
    }
  }
}
