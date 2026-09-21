//// aim:cag,plan:sync - the organiser's sync plan (SPEC 10.3).
////
//// READ-ONLY. It returns exactly what apply:sync would send and sends
//// nothing, which is C4's dry-run-by-default. There is deliberately no
//// aim:cag,apply:sync yet: applying reaches real speakers, and the confirmed
//// surface lands with the lock (C10) and the queue, not before.
////
//// The work happens in sys:calendar, which has no aim: surface of its own -
//// those patterns are destined for senecajs/Calendar upstream (SPEC 10.1).

module.exports = function make_plan_sync() {
  return async function plan_sync(this: any, msg: any) {
    return this.post('sys:calendar,plan:sync', { fixture_id: msg.fixture_id })
  }
}
