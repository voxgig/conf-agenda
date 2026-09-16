/* The sync ledger and the reconciliation loop. SPEC 10.3.
 *
 * "An implementation that sends invitations is easy; one that never sends a
 * duplicate is the product." Everything here exists to make the second true.
 *
 * NAMESPACE. These patterns answer `sys:calendar,*`, not `concern:*`, because
 * SPEC 10.2 names them and they are destined for senecajs/Calendar upstream -
 * the namespace is what makes that move a lift rather than a rename (10.1).
 * Loaded like a concern (once, in env/shared/basic.ts) so there is no `aim:`
 * surface and nothing gateway-reachable: the app reaches sync through
 * aim:cag,plan:sync.
 *
 * PROVIDERS ARE MESSAGES, NOT AN INTERFACE. A provider is a plugin adding
 * more-specific patterns that dispatch on the account's `provider` property
 * (PLATFORM 1.2). There is deliberately no CalendarProvider TypeScript
 * interface: a TS interface for a swappable backend is the smell that means
 * the bus is being bypassed, and it is also what puts the safety rules BELOW
 * the dispatch instead of above it.
 *
 * ORDER OF CONSTRUCTION, AND THE ORDER IS THE POINT (SPEC 10.5): the ledger
 * and this loop are built against a FAKE provider that records every call,
 * before any real provider exists. Build Google first and add the dedup gate
 * afterwards and you have shipped a thing that double-invites.
 */
import {
  buildSpec, hashSpec, invitable, EventSpec, SpecFixture,
} from '../../lib/eventspec'

/** SPEC C5: a per-run outbound cap. Exceeding it aborts BEFORE the first send. */
const DEFAULT_CAP = 100

type Account = { id: string; provider?: string; calendar_id?: string; [k: string]: unknown }

type Link = {
  id: string
  fixture_id: string
  top_id: string
  account_id: string
  provider_event_id?: string
  uid: string
  sequence: number
  content_hash: string
  state: string
  [k: string]: unknown
}

/** One decided unit of work. `noop` entries are kept: C2 is only visible if
 *  the plan can SHOW that nothing needs doing. */
export type PlanItem = {
  action: 'create' | 'update' | 'cancel' | 'noop'
  fixture_id: string
  account_id: string
  uid: string
  title: string
  sequence: number
  hash: string
  why: string
  spec?: EventSpec
  link_id?: string
  provider_event_id?: string
}

export type SyncPlan = {
  ok: boolean
  top_id: string
  items: PlanItem[]
  counts: Record<string, number>
  /** Distinct speakers across every sending action - what C4 makes the
   *  organiser confirm. */
  recipients: number
  cap: number
  capped: boolean
  why?: string
}


export default function CalendarSync(this: any, options: any) {
  const seneca: any = this
  const cap: number = null == options.cap ? DEFAULT_CAP : options.cap

  /**
   * Decide what should happen, and send nothing. The whole of C4's dry-run
   * lives here: plan:sync is read-only, and apply:sync is this same function
   * followed by dispatch, so what you confirmed is what goes out.
   */
  async function planFor(this: any, fixture_id: string): Promise<SyncPlan> {
    const empty = (why: string): SyncPlan => ({
      ok: false, top_id: '', items: [], counts: {}, recipients: 0, cap, capped: false, why,
    })

    const tree = await this.post('concern:fixture,resolve:tree', { fixture_id })
    if (!tree.ok) return empty(tree.why || 'tree-failed')

    const top = tree.nodes.find((n: any) => n.id === fixture_id)
    if (null == top) return empty('not-found')
    const top_id: string = tree.top_id || fixture_id

    const org_q = null == top.org_id ? {} : { org_id: top.org_id }
    const accounts: Account[] = (await this.entity('sys/calendar_account').list$(org_q))
      .map((r: any) => r.data$(false))
      .filter((a: Account) => 'disconnected' !== a.status)
      .sort((a: Account, b: Account) => (a.id < b.id ? -1 : 1))

    const rooms = new Map((await this.entity('cag/room').list$(org_q))
      .map((r: any) => [r.id, r.data$(false)]))
    const speakers = new Map((await this.entity('cag/speaker').list$(org_q))
      .map((r: any) => [r.id, r.data$(false)]))
    const appearances = (await this.entity('cag/appearance').list$(org_q))
      .map((r: any) => r.data$(false))

    // LINKS ARE LOADED BY top_id, NOT by walking the live tree. That is what
    // finds the links whose fixtures have been deleted - the C8 failure is a
    // resolver that only discovers events through surviving parent_id chains,
    // and loses exactly the events whose ancestors were removed.
    const links: Link[] = (await this.entity('sys/calendar_link').list$({ top_id }))
      .map((r: any) => r.data$(false))
    const linkOf = (f: string, a: string) =>
      links.find((l) => l.fixture_id === f && l.account_id === a)

    const nodes: SpecFixture[] = tree.nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const items: PlanItem[] = []
    const recipients = new Set<string>()

    const attendeesOf = (fid: string) => appearances
      .filter((a: any) => a.fixture_id === fid)
      .map((a: any) => speakers.get(a.speaker_id))
      .map((s: any) => (s && s.email ? String(s.email) : ''))
      .filter(Boolean)

    for (const account of accounts) {
      // --- segments that still exist -----------------------------------
      for (const f of nodes) {
        if (f.id === top_id) continue
        const link = linkOf(f.id, account.id)

        // CANCELLATION IS CHECKED FIRST, BEFORE ANY HASH COMPARISON.
        // The hash covers live-event fields only (see lib/eventspec.ts), so a
        // cancelled segment's hash is typically UNCHANGED - a hash-first
        // shortcut no-ops it and leaves the event alive in the speaker's
        // calendar. This ordering is the requirement, not an optimisation.
        if (!invitable(f)) {
          if (link && 'active' === link.state) {
            items.push({
              action: 'cancel',
              fixture_id: f.id, account_id: account.id,
              uid: link.uid, title: String(f.title || f.id),
              sequence: (link.sequence || 0) + 1, hash: link.content_hash,
              why: 'cancelled' === f.effective_status
                ? 'segment-cancelled'
                : 'no-longer-invitable',
              link_id: link.id, provider_event_id: link.provider_event_id,
            })
          }
          continue
        }

        const room = null == f.room_id ? null : rooms.get(String(f.room_id))
        const spec = buildSpec({
          fixture: f,
          topSlug: String((top as any).slug || top_id),
          roomName: room ? String((room as any).name || '') : '',
          tzn: (top as any).t_tzn as string,
          attendees: attendeesOf(f.id),
        })
        const hash = hashSpec(spec)

        if (null == link) {
          spec.attendees.forEach((e) => recipients.add(e))
          items.push({
            action: 'create', fixture_id: f.id, account_id: account.id,
            uid: spec.uid, title: spec.title, sequence: 0, hash,
            why: 'no-link', spec,
          })
        }
        else if ('cancelled' === link.state) {
          // A resurrection. Same UID, and the sequence continues from the
          // tombstone - which is why links are never deleted.
          spec.attendees.forEach((e) => recipients.add(e))
          items.push({
            action: 'create', fixture_id: f.id, account_id: account.id,
            uid: link.uid, title: spec.title, sequence: (link.sequence || 0) + 1,
            hash, why: 'resurrected', spec, link_id: link.id,
          })
        }
        else if (link.content_hash === hash) {
          // THE COMMON CASE, AND IT MUST COST NO API CALLS. Kept in the plan
          // so the organiser can see it: "13 further segments, hash unchanged,
          // no-op, zero provider calls" is C2 made visible.
          items.push({
            action: 'noop', fixture_id: f.id, account_id: account.id,
            uid: link.uid, title: spec.title, sequence: link.sequence, hash,
            why: 'hash-unchanged', link_id: link.id,
            provider_event_id: link.provider_event_id,
          })
        }
        else {
          spec.attendees.forEach((e) => recipients.add(e))
          items.push({
            action: 'update', fixture_id: f.id, account_id: account.id,
            uid: link.uid, title: spec.title, sequence: (link.sequence || 0) + 1,
            hash, why: 'hash-changed', spec, link_id: link.id,
            provider_event_id: link.provider_event_id,
          })
        }
      }

      // --- links whose segment has VANISHED -----------------------------
      // Found only because links are scoped by top_id. Deleting an
      // intermediate day must not strand its talks' events (C8).
      for (const link of links) {
        if (link.account_id !== account.id) continue
        if ('active' !== link.state) continue
        if (byId.has(link.fixture_id)) continue
        items.push({
          action: 'cancel', fixture_id: link.fixture_id, account_id: account.id,
          uid: link.uid, title: link.uid, sequence: (link.sequence || 0) + 1,
          hash: link.content_hash, why: 'segment-deleted',
          link_id: link.id, provider_event_id: link.provider_event_id,
        })
      }
    }

    // Deterministic order, so two plans over identical data are identical
    // (SPEC 17) and the diff the organiser confirms is stable.
    items.sort((a, b) =>
      (a.account_id < b.account_id ? -1 : a.account_id > b.account_id ? 1
        : a.fixture_id < b.fixture_id ? -1 : a.fixture_id > b.fixture_id ? 1 : 0))

    const counts = items.reduce((acc: Record<string, number>, it) => {
      acc[it.action] = (acc[it.action] || 0) + 1
      return acc
    }, {})

    const sending = items.filter((i) => 'noop' !== i.action).length
    return {
      ok: true, top_id, items, counts,
      recipients: recipients.size,
      cap, capped: sending > cap,
    }
  }


  seneca
    .fix('sys:calendar')

    // C4: DRY RUN BY DEFAULT. Read-only, and returns exactly what apply would
    // send. Nothing below writes a link or touches a provider.
    .message('plan:sync', { fixture_id: String }, async function (this: any, msg: any) {
      return planFor.call(this, msg.fixture_id)
    })

    // BASE PATTERNS. A provider is a plugin adding MORE-SPECIFIC patterns that
    // dispatch on the account's `provider` property, so these are what an
    // unconfigured or unknown provider falls through to. They refuse rather
    // than throwing act_not_found: a missing provider is an ordinary
    // operational state, not a programming error.
    .message('create:extevent', { provider: String }, async function (this: any, msg: any) {
      return { ok: false, why: 'no-provider:' + msg.provider }
    })
    .message('update:extevent', { provider: String }, async function (this: any, msg: any) {
      return { ok: false, why: 'no-provider:' + msg.provider }
    })
    .message('cancel:extevent', { provider: String }, async function (this: any, msg: any) {
      return { ok: false, why: 'no-provider:' + msg.provider }
    })

    // The send gate. Every provider call in the system goes through here, so
    // this is where the safety rules sit - ABOVE the dispatch, which is what
    // makes them hold for providers that do not exist yet (SPEC 10.2).
    .message('send:invite', { item: Object, account: Object }, async function (
      this: any, msg: any,
    ) {
      const item: PlanItem = msg.item
      const account: Account = msg.account
      if ('noop' === item.action) return { ok: true, noop: true, calls: 0 }

      const verb = 'cancel' === item.action ? 'cancel:extevent'
        : 'create' === item.action ? 'create:extevent' : 'update:extevent'

      const out = await this.post('sys:calendar,' + verb, {
        provider: account.provider,
        account,
        item,
        spec: item.spec,
      })
      // C9: a provider rejection is RECORDED and returned, never swallowed.
      // "Sent" means the provider accepted it.
      return out && out.ok ? { ok: true, ...out } : {
        ok: false, why: (out && out.why) || 'provider-failed',
      }
    })

    // Plan, then dispatch, then write the ledger. Still not a real provider:
    // dispatch lands on whatever answers `provider:<name>`, and at Stage 1
    // that is the recording fake and nothing else.
    // `confirm` is deliberately NOT in the message shape. Declaring it as
    // required throws when it is missing, and declaring it with a literal
    // default folds it into the PATTERN, so an unconfirmed call matches
    // nothing at all. Both turn C4's refusal into an exception, and a refusal
    // that arrives as a stack trace is not a refusal the caller can act on.
    .message('apply:sync', { fixture_id: String }, async function (
      this: any, msg: any,
    ) {
      const plan = await planFor.call(this, msg.fixture_id)
      if (!plan.ok) return plan

      // C4: apply requires explicit confirmation, and the counts the organiser
      // confirmed are stated back rather than assumed.
      if (true !== msg.confirm) {
        return { ...plan, ok: false, why: 'confirmation-required' }
      }

      // C5: BOUNDED BLAST RADIUS. The abort happens here, before the loop -
      // "aborts before the first send" is the requirement, and a cap checked
      // inside the loop has already sent ninety-nine invitations.
      if (plan.capped) {
        return {
          ...plan, ok: false, why: 'outbound-cap-exceeded',
          would_send: plan.items.filter((i) => 'noop' !== i.action).length,
        }
      }

      // C10: ONE SYNC AT A TIME PER CONFERENCE. Concurrent syncs are the other
      // way duplicates appear - two runs both read "no link", both create.
      //
      // TWO HALVES, and both are needed. The advisory lock makes the
      // check-and-create below atomic within a process; the RUN ROW is what
      // survives a restart, and "one sync at a time" has to survive one.
      const lock = await this.post('sys:calendar,acquire:lock', { top_id: plan.top_id })
      if (!lock.ok) return { ...plan, ok: false, why: 'sync-in-progress' }

      try {
        const live = (await this.entity('sys/calendar_run')
          .list$({ top_id: plan.top_id, state: 'running' })).length
        if (0 < live) return { ...plan, ok: false, why: 'sync-in-progress' }

        // Enqueue and return. The sending happens in the queue, not in this
        // request (SPEC 10.6) - which is what makes the run observable per
        // segment and resumable after a crash.
        const top = await this.entity('cag/fixture').load$(plan.top_id)
        const enq = await this.post('sys:calendar,enqueue:run', {
          plan, org_id: String((top && top.org_id) || ''),
        })
        return { ok: true, top_id: plan.top_id, counts: plan.counts, run_id: enq.run_id }
      }
      finally {
        // ALWAYS. A failure here must not leave the conference locked out of
        // syncing until the TTL expires.
        await this.post('sys:calendar,release:lock',
          { top_id: plan.top_id, token: lock.token })
      }
    })

    // Write the ledger for one settled job. Split out of the run loop because
    // the QUEUE is what settles jobs now, and the ledger write has to happen
    // wherever that is - never twice, and never in the caller.
    .message('record:link', { top_id: String, item: Object, out: Object }, async function (
      this: any, msg: any,
    ) {
      await writeLink.call(this, msg.top_id, msg.item, msg.out, msg.org_id)
      return { ok: true }
    })

  /** Upsert by identity, exactly as the upstream outbox does (SPEC 10.1). */
  async function writeLink(
    this: any, top_id: string, item: PlanItem, out: any, org_id?: string,
  ) {
    // A no-op reached no provider, so there is nothing to record. Writing here
    // would bump t_m on a link nothing happened to.
    if (out && true === out.noop) return

    const ent = this.entity('sys/calendar_link')

    if ('cancel' === item.action) {
      // TOMBSTONE, NEVER DELETE. The tombstone is what stops a resurrection
      // creating a duplicate.
      const row = await ent.load$(item.link_id)
      if (row) {
        await row.data$({
          state: 'cancelled', sequence: item.sequence, last_error: '',
        }).save$()
      }
      return
    }

    const fields: any = {
      fixture_id: item.fixture_id,
      top_id,
      ...(null == org_id || '' === org_id ? {} : { org_id }),
      account_id: item.account_id,
      uid: item.uid,
      sequence: item.sequence,
      content_hash: item.hash,
      state: 'active',
      provider_event_id: String(out.provider_event_id || item.provider_event_id || ''),
      // '' and not null: the entity validator built from the model rejects an
      // explicit null in a String field - the same thing ent.aon records about
      // parent_id, where absence is the representation. Here the empty string
      // says "no error" perfectly well.
      last_error: '',
    }

    // `id$` only ever CREATES - saving an existing id that way is
    // entity-id-exists, which is exactly what the snapshot upsert hit on
    // republish. An update loads the row and saves it back.
    if (item.link_id) {
      const row = await ent.load$(item.link_id)
      if (row) {
        await row.data$(fields).save$()
        return
      }
    }
    await ent.make$().data$(fields).save$()
  }
}
