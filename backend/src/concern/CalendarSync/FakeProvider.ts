/* A recording calendar provider. Not a mock bolted onto the tests - a real
 * provider plugin, built FIRST and on purpose (SPEC 10.5).
 *
 * The order matters and it is the design: the ledger and the reconciliation
 * loop are proven against a provider that records every call, before Google
 * exists. Build the real provider first and add the dedup gate afterwards and
 * you have shipped a thing that double-invites - which is the one failure that
 * ends this product's credibility.
 *
 * Everything C1-C5 and C8 claims is only checkable because this exists:
 *   "full sync twice -> ZERO provider writes on the second pass"
 * is a sentence about calls, and calls are what this counts.
 *
 * It is a plugin adding more-specific patterns that dispatch on the account's
 * `provider` property, exactly as provider:google will (SPEC 10.2). No
 * TypeScript interface anywhere: the messages ARE the abstraction, which is
 * what keeps the safety wrap above the dispatch.
 */

export type ProviderCall = {
  op: 'create' | 'update' | 'cancel'
  uid: string
  account_id: string
  sequence: number
  /** The attendee emails this call would actually have gone to. */
  attendees: string[]
}

export type FakeState = {
  calls: ProviderCall[]
  /** Live provider events by id - so a test can assert a cancelled event is
   *  really gone rather than merely unreferenced. */
  events: Map<string, { uid: string; sequence: number; state: string }>
  /** Set to make the next call fail, for the C9 path. */
  failNext: string | null
}

/** Shared so tests can read it without reaching into plugin internals. */
export const fakeState: FakeState = {
  calls: [],
  events: new Map(),
  failNext: null,
}

export function resetFake() {
  fakeState.calls = []
  fakeState.events = new Map()
  fakeState.failNext = null
}


export default function FakeProvider(this: any) {
  const seneca: any = this
  let counter = 0

  // Deterministic ids: a provider event id from a random source would differ
  // between two otherwise identical runs, and SPEC 17 wants identical input to
  // give identical output.
  const nextId = () => 'fake_evt_' + String(++counter).padStart(4, '0')

  function record(op: ProviderCall['op'], msg: any, sequence: number) {
    const spec = msg.spec || {}
    fakeState.calls.push({
      op,
      uid: String(msg.item.uid),
      account_id: String(msg.item.account_id),
      sequence,
      attendees: (spec.attendees || []).slice(),
    })
  }

  function maybeFail(op: string) {
    if (fakeState.failNext === op) {
      fakeState.failNext = null
      return { ok: false, why: 'provider-rejected' }
    }
    return null
  }

  seneca
    .fix('sys:calendar,provider:fake')

    .message('create:extevent', { item: Object }, async function (this: any, msg: any) {
      const fail = maybeFail('create')
      if (fail) return fail
      const id = nextId()
      record('create', msg, msg.item.sequence)
      fakeState.events.set(id, {
        uid: String(msg.item.uid), sequence: msg.item.sequence, state: 'active',
      })
      return { ok: true, provider_event_id: id }
    })

    .message('update:extevent', { item: Object }, async function (this: any, msg: any) {
      const fail = maybeFail('update')
      if (fail) return fail
      const id = String(msg.item.provider_event_id || '')
      record('update', msg, msg.item.sequence)
      const ev = fakeState.events.get(id)
      // SAME id, SAME uid, sequence + 1. An update that created a new event
      // here would be exactly the bug C3 exists to catch.
      if (ev) ev.sequence = msg.item.sequence
      return { ok: true, provider_event_id: id }
    })

    .message('cancel:extevent', { item: Object }, async function (this: any, msg: any) {
      const fail = maybeFail('cancel')
      if (fail) return fail
      const id = String(msg.item.provider_event_id || '')
      record('cancel', msg, msg.item.sequence)
      const ev = fakeState.events.get(id)
      if (ev) ev.state = 'cancelled'
      return { ok: true, provider_event_id: id }
    })

    // A provider that lacks a capability answers not-supported rather than
    // succeeding silently (SPEC 10.2). The fake has no RSVP flow, and saying
    // so is the honest answer - a silent success here would read as "nobody
    // has responded yet" forever.
    .message('get:rsvps', {}, async function () {
      return { ok: false, why: 'not-supported' }
    })
}
