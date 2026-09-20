/* The safety chain over send:invite, and the per-conference lock. SPEC 10.5.
 *
 * THE POINT IS WHERE THIS SITS, NOT WHAT IT DOES.
 *
 * Each rule below is a same-pattern override calling `this.prior()`, layered
 * ABOVE the provider dispatch. So the cap, the redaction and the ledger gate
 * hold for EVERY provider - including ones added years from now by someone who
 * has never read this file - because they sit above the point where the
 * provider is chosen. Put them inside a provider and the next provider ships
 * without them; put them inside the caller and a second caller ships without
 * them. This is what PLATFORM 1.2 means by the bus being the abstraction.
 *
 * ORDER. Each definition wraps the previous, so the LAST registered is the
 * outermost. Registered base -> gate -> redaction -> cap, which executes:
 *
 *     cap (C5)  ->  redaction (C7)  ->  ledger gate (C2/C3)  ->  provider
 *
 * exactly the chain SPEC 10.3's sequence diagram draws. The cap is outermost
 * because refusing early is the whole of "bounded blast radius": a cap checked
 * under the gate has already let the gate do its work, and a cap checked under
 * redaction reports an unredacted reason.
 */
import { redactReason } from '../../lib/redact'

const DEFAULT_CAP = 100

/** Advisory locks, per top fixture. In-process, which is the correct scope for
 *  the local monolith - see the note on acquire:lock below. */
const locks = new Map<string, { token: string; at: number }>()

/** Sends counted per run, for the cap. A run that never releases would leak a
 *  counter, so entries are dropped when the run ends. */
const runSends = new Map<string, number>()

export function resetSafety() {
  locks.clear()
  runSends.clear()
}


export default function CalendarSafety(this: any, options: any) {
  const seneca: any = this
  const cap: number = null == options.cap ? DEFAULT_CAP : options.cap
  // A lock older than this is assumed to belong to a crashed run. Without it,
  // one crash locks a conference out of syncing for ever.
  const lockTtl: number = null == options.lock_ttl ? 5 * 60 * 1000 : options.lock_ttl

  seneca
    .fix('sys:calendar')

    // ---- the lock (C10) --------------------------------------------------
    // "One sync at a time per conference. Concurrent syncs are the other way
    // duplicates appear." Upstream documents exactly this gap - notify:due has
    // no lock, run a single scheduler - so the extension adds the lock rather
    // than assuming one.
    //
    // In-process is the RIGHT scope here and a LIE at Stage 4: on Cloudflare
    // this becomes a Durable Object, because two isolates share no Map. The
    // message shape is what stays the same, which is the point of putting it
    // behind one.
    .message('acquire:lock', { top_id: String }, async function (this: any, msg: any) {
      const held = locks.get(msg.top_id)
      const now = Date.now()
      if (held && now - held.at < lockTtl) {
        return { ok: false, why: 'locked', held_for: now - held.at }
      }
      const token = msg.top_id + ':' + now + ':' + Math.random().toString(36).slice(2, 8)
      locks.set(msg.top_id, { token, at: now })
      return { ok: true, token }
    })

    .message('release:lock', { top_id: String, token: String }, async function (
      this: any, msg: any,
    ) {
      const held = locks.get(msg.top_id)
      // Only the holder releases. A release that ignored the token would let a
      // timed-out run unlock the run that replaced it, and then both are live.
      if (held && held.token !== msg.token) return { ok: false, why: 'not-holder' }
      locks.delete(msg.top_id)
      return { ok: true }
    })

    // The per-run send budget is a RUN's, so it is released when the run
    // ends - posted by the queue, which is the only thing that knows.
    //
    // It used to be dropped here, in release:lock, as `runSends.delete(token)`
    // - wrong twice over. runSends is keyed by run_id and a lock token is an
    // unrelated string, so nothing was ever deleted and the Map grew for the
    // life of the process; and the lock is released the moment apply:sync has
    // ENQUEUED, long before the queue sends anything, so even keyed correctly
    // it would have discarded the budget before it was spent.
    .message('clear:sends', { run_id: String }, async function (this: any, msg: any) {
      runSends.delete(String(msg.run_id))
      return { ok: true }
    })


    // ---- innermost wrap: the ledger gate (C2/C3) -------------------------
    // Defence in depth. apply:sync already decided this from the plan, but a
    // caller that hand-builds an item - a retry, a queue replay, a future
    // scheduler - must not be able to re-send an unchanged event. The ledger,
    // not the caller, is the authority on whether anything needs sending.
    .message('send:invite', { item: Object }, async function (this: any, msg: any) {
      const item = msg.item
      if ('create' !== item.action && 'update' !== item.action) {
        return this.prior(msg)
      }

      // THE GATE LOOKS THE LINK UP BY IDENTITY, NOT BY link_id.
      //
      // It used to return early whenever `link_id` was null - which is ALWAYS
      // true for a create, because a create is what produces the link. So the
      // backstop was inert on precisely the action that creates provider
      // events, and the case it exists for was the one it could not see: a
      // create whose provider actually succeeded but reported failure (a
      // timeout, a 5xx after commit), retried by the queue, making a second
      // event in the speaker's calendar.
      //
      // The ledger's identity is (segment x account) - that is what
      // writeLink upserts on - so that is what the gate asks about. `top_id`
      // is denormalised scoping and the item does not carry it.
      const link = null != item.link_id
        ? await this.entity('sys/calendar_link').load$(item.link_id)
        : (await this.entity('sys/calendar_link')
          .list$({ fixture_id: item.fixture_id, account_id: item.account_id }))[0]

      // A cancelled link is a tombstone, and a resurrection is meant to pass:
      // same UID, sequence continuing. Only an ACTIVE link with the same hash
      // means "this already went, unchanged".
      if (link && 'active' === link.state && link.content_hash === item.hash) {
        return { ok: true, noop: true, calls: 0, why: 'ledger-gate:hash-unchanged' }
      }
      return this.prior(msg)
    })

    // ---- middle wrap: redaction (C7) -------------------------------------
    // Everything a provider hands back passes through here on its way to a
    // ledger row, a run report or a log. A provider SDK's error commonly
    // embeds the request it failed on, headers included - and that string is
    // then stored, shipped to a log aggregator and pasted into a support
    // ticket, without ever passing through anyone's own code.
    .message('send:invite', { item: Object }, async function (this: any, msg: any) {
      const out = await this.prior(msg)
      if (out && out.ok) return out
      return { ...out, ok: false, why: redactReason(out && out.why) }
    })

    // ---- outermost wrap: the outbound cap (C5) ---------------------------
    // "Bounded blast radius." apply:sync aborts on the plan before the loop
    // starts, which is where the requirement is actually met; this is the
    // backstop for anything that reaches send:invite by another route, and it
    // refuses rather than truncating - a half-sent run is worse than a
    // refused one.
    .message('send:invite', { item: Object }, async function (this: any, msg: any) {
      const run = String(msg.run_id || '')
      if ('' === run) return this.prior(msg)

      const sent = runSends.get(run) || 0
      if (sent >= cap) {
        return { ok: false, why: 'outbound-cap-exceeded', cap, sent }
      }

      const out = await this.prior(msg)
      // Count what actually reached a provider. A no-op costs nobody an email
      // and must not consume the budget.
      if (out && out.ok && true !== out.noop) runSends.set(run, sent + 1)
      return out
    })
}
