//// Browser proxy for aim:cag,watch:run.
////
//// `watch:` AND NOT `get:`, and the name is load-bearing.
////
//// The SPA's transparent cache (SenecaBrowserStore, configured in
//// web/src/bus.js) classifies any aim:web message carrying a `get`/`list`/
//// `load` key as a CACHEABLE READ, and invalidates only on a client-side
//// write. A sync run has neither property: its state changes on the SERVER,
//// as the queue works, with no browser write to invalidate anything. Named
//// `get:run` it was cached on the first poll and every subsequent poll
//// returned the same "pending" forever, while the run had long since
//// finished - the screen and the truth silently disagreed.
////
//// A verb outside the read and write lists is passed through uncached, which
//// is the correct behaviour for a poll, and the name now says so.

module.exports = function make_web_watch_run() {
  return async function web_watch_run(this: any, msg: any) {
    return this.post('aim:cag,watch:run', { run_id: msg.run_id })
  }
}
