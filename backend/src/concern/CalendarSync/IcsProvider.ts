/* provider:ics — invitations as iTIP .ics by email. SPEC 10.2.
 *
 * THE FALLBACK, AND ALWAYS AVAILABLE. No OAuth, no API client, no connected
 * account beyond an address to send from. It is also the honest answer for
 * services with no third-party calendar API at all (Proton, at time of
 * writing): their speakers get correct, updatable .ics mail rather than a
 * broken integration that half-works.
 *
 * It is the FIRST REAL PROVIDER - the fake one records calls, this one
 * produces the actual bytes a speaker's client will read. Which makes it the
 * proof that the provider seam works for something other than a test double,
 * and it can be proven offline, which Google cannot.
 *
 * DELIVERY IS A SEPARATE SEAM, on purpose. This plugin builds the invitation;
 * `sys:calendar,deliver:invite` puts it in front of a person. With nothing
 * registered to deliver, the default below REFUSES - because C9 says "sent"
 * means the provider accepted it, and a provider that builds a file and drops
 * it on the floor while reporting success is the exact lie that requirement
 * exists to prevent.
 */
import { buildInvite, inviteSubject } from '../../lib/invite'

export type DeliveredInvite = {
  op: 'create' | 'update' | 'cancel'
  uid: string
  sequence: number
  to: string[]
  subject: string
  ics: string
}

/** A recording deliverer, for dev and tests. Never mails anything. */
export const icsOutbox: { sent: DeliveredInvite[] } = { sent: [] }

export function resetIcsOutbox() {
  icsOutbox.sent = []
}


export default function IcsProvider(this: any, options: any) {
  const seneca: any = this
  const opts = options || {}
  // Where invitations come FROM. A real deployment sets this per account.
  const organiser = {
    name: String(opts.organiser_name || 'conf-agenda'),
    email: String(opts.organiser_email || 'calendar@conf-agenda.invalid'),
  }

  async function send(this: any, op: DeliveredInvite['op'], msg: any) {
    const item = msg.item
    const spec = msg.spec || (item && item.spec)
    if (null == spec) return { ok: false, why: 'no-spec' }

    // A cancellation still names its attendees - the spec for a cancel comes
    // from the LINK, not the live segment, which is why the ledger stores it.
    const to = spec.attendees || []
    if (0 === to.length) {
      // Nobody to write to is not a success. An invitation with no recipient
      // that reports `ok` shows as SENT on the run screen and reached no one.
      return { ok: false, why: 'no-recipients' }
    }

    const input = {
      spec,
      sequence: item.sequence || 0,
      method: ('cancel' === op ? 'cancel' : 'request') as 'cancel' | 'request',
      // The ledger's decision, so the subject can tell a resurrection from an
      // update - the file cannot, because both are METHOD:REQUEST.
      action: (item && item.action) as 'create' | 'update' | 'cancel' | undefined,
      organiser,
      conference: msg.conference,
    }
    const ics = buildInvite(input)

    const out = await this.post('sys:calendar,deliver:invite', {
      to, subject: inviteSubject(input), ics,
      uid: spec.uid, sequence: input.sequence, op,
    })
    if (!out || !out.ok) {
      return { ok: false, why: (out && out.why) || 'delivery-failed' }
    }

    // The provider event id is the UID: there is no remote object to point at,
    // the mail IS the event. Stable, so an update finds the same link.
    return { ok: true, provider_event_id: spec.uid }
  }

  seneca
    .fix('sys:calendar')

    // The delivery seam's DEFAULT. Refuses, loudly. Anything that actually
    // mails registers a more-specific pattern and wins the dispatch, exactly
    // as a provider does (PLATFORM 1.2).
    .message('deliver:invite', { uid: String }, async function () {
      return { ok: false, why: 'no-deliverer-configured' }
    })

    // The recording deliverer, for dev and tests. Registered LAST so it
    // overrides the refusal above - and it is the reason this provider can be
    // proven end to end with no mail server anywhere.
    .message('deliver:invite', { uid: String }, async function (this: any, msg: any) {
      if (true !== opts.record) return this.prior(msg)
      icsOutbox.sent.push({
        op: msg.op, uid: msg.uid, sequence: msg.sequence,
        to: msg.to.slice(), subject: msg.subject, ics: msg.ics,
      })
      return { ok: true }
    })

  seneca
    .fix('sys:calendar,provider:ics')

    .message('create:extevent', { item: Object }, async function (this: any, msg: any) {
      return send.call(this, 'create', msg)
    })

    .message('update:extevent', { item: Object }, async function (this: any, msg: any) {
      return send.call(this, 'update', msg)
    })

    .message('cancel:extevent', { item: Object }, async function (this: any, msg: any) {
      // The spec for a cancellation comes from the LINK's stored copy: the
      // live segment may be cancelled, re-timed or deleted outright, and the
      // people to tell are the ones who were invited, not whoever is attached
      // to it now.
      return send.call(this, 'cancel', msg)
    })

    // No RSVP flow: mail comes back to a mailbox, not to an API. Saying so is
    // the honest answer - a silent success would read as "nobody has responded
    // yet" for ever (SPEC 10.2).
    .message('get:rsvps', {}, async function () {
      return { ok: false, why: 'not-supported' }
    })
}
