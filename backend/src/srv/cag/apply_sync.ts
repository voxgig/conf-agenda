//// aim:cag,apply:sync - run the confirmed plan (SPEC 10.3, C4).
////
//// THIS IS THE MESSAGE THAT REACHES REAL SPEAKERS, and it is the only one on
//// the app surface that does. Everything below it is already gated:
////
////   confirm: true          required here AND re-checked in sys:calendar
////   outbound cap (C5)      aborts on the plan, before the first send
////   one run per conference (C10)  advisory lock + an active run row
////   the ledger gate (C2/C3)       above the provider dispatch
////
//// It ENQUEUES and returns a run id; the queue does the sending, so the
//// request cannot half-send and then time out.

module.exports = function make_apply_sync() {
  return async function apply_sync(this: any, msg: any) {
    return this.post('sys:calendar,apply:sync', {
      fixture_id: msg.fixture_id,
      // Never defaulted to true anywhere on the way down. A confirmation that
      // can be lost in transit is not a confirmation.
      confirm: true === msg.confirm,
    })
  }
}
