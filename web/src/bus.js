// The browser-side Seneca service bus. All component state and all
// backend communication flow through messages on this bus:
//
//   aim:web,*         -> the backend gateway (/seneca) via the
//                        seneca-browser fetch transport (cookie auth)
//   cmp:*             -> local component plugins (state)
//
// Cross-component notification uses the tiny `evt` plugin below:
// components post cmp:bus,emit:<name> and subscribe with onEvent().

/* global Seneca, SenecaBrowserStore, SenecaBrowserDebug */

const bus = Seneca({
  legacy: false,
  timeout: 8888,
  plugin: {
    browser: {
      endpoint: '/seneca',
      fetch: {
        credentials: 'same-origin',
      },
    },
  },
})
  .test()
  .client({ type: 'browser', pin: 'aim:web' })


// Transparent state cache (Redux-like): caches aim:web query results and
// invalidates on writes, so repeated reads are served without a round-trip.
// Registered AFTER .client() so the aim:web pin actions exist to be wrapped.
if ('undefined' !== typeof SenecaBrowserStore) {
  bus.use(SenecaBrowserStore, {
    pin: 'aim:web',
    // Defaults plus 'revoke': aim:web,on:auth,revoke:apikey must
    // invalidate the cached list:apikey reads.
    write: ['save', 'remove', 'update', 'delete', 'create', 'done', 'set', 'add', 'revoke'],
  })
}

// In-window devtools: a resizable/hideable pop-up showing live Seneca
// message flows, config, and (via the store plugin above) the cache tree.
// aim:web messages are the remote (backend) calls. Loaded as a global script
// in index.html; guarded so a missing bundle never breaks the app.
if ('undefined' !== typeof SenecaBrowserDebug) {
  bus.use(SenecaBrowserDebug, { remotePins: 'aim:web' })
}


// Event fanout, unified on Seneca messages: cross-component events use the
// bus's own sub/act. Unlike a plain `add` (single handler), `sub` allows
// many observers per pattern - so it IS the pub/sub primitive. A no-op sink
// action lets `act` resolve; observers subscribe via `sub`. This is the same
// mechanism reactivity uses (see @seneca/browser-store's changed:* events).
bus.add('cmp:evt', function (msg, reply) {
  reply()
})

function onEvent(name, fn) {
  bus.sub('cmp:evt,name:' + name, function (msg) {
    fn(msg.data || {})
  })
}

function emit(name, data) {
  bus.act('cmp:evt,name:' + name, { data })
}


// Avoid cross-user staleness: drop all cached queries whenever auth changes
// (sign in / sign out), since cached results are principal-scoped.
if ('undefined' !== typeof SenecaBrowserStore) {
  onEvent('auth', function () {
    bus.act('sys:browser-store,clear:store', function () {})
  })
}


// THE BUS IS REACHABLE FROM THE PAGE, ON PURPOSE (PLATFORM 10).
//
// "A Playwright spec drives a full user journey through window.seneca.post()
// with ZERO DOM interaction, asserting only that the DOM followed. Without it,
// 'drivable by messages' decays into 'was built that way once'." That spec is
// web/e2e/bus-drive.spec.js, and this is what it drives.
//
// It grants nothing new. The transport is pinned to aim:web, which is the only
// namespace the gateway accepts, and anything postable here is equally
// postable with a fetch to /seneca from the same console. The security
// boundary is the gateway allow-list and the per-message params shape, not the
// absence of a handle.
if ('undefined' !== typeof window) {
  window.seneca = bus
}

export {
  bus,
  onEvent,
  emit,
}
