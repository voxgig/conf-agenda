//// aim:cag,watch:run - per-segment progress for one sync run (SPEC 10.6).
//// `watch:` and not `get:` on purpose - see web_watch_run.ts.
//// Read-only: "the organiser sees a run with per-segment state, not a
//// spinner."

module.exports = function make_watch_run() {
  return async function watch_run(this: any, msg: any) {
    return this.post('sys:calendar,get:run', { run_id: msg.run_id })
  }
}
