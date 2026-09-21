// UNDO, AS A LOG OF INVERSE MESSAGES (PLATFORM 1.4, 5.5).
//
// Undo runs each definition's DECLARED `inverse` - an ordinary edit that the
// ledger, the validator and the audit trail see like any other. Not a
// snapshot restore: a snapshot puts back state the server may have moved on
// from, and it reaches the calendar as a change nobody made.
//
// PLATFORM 5.5 lists this as something the browser-store extraction must ADD,
// and the vendored web/public/seneca-browser-store.js has no undo or inverse
// code at all. So it lives here rather than forking a file this project does
// not own. When the store grows it upstream, this module is what moves.
//
// buildInverse is PURE on purpose. web/ has no unit runner - web/package.json
// carries only playwright - so the one piece with real logic in it is written
// to be importable by `node --test` from the backend suite. Everything else
// here is a stack.

/** Resolve one `map` value: 'params.x' / 'result.prev.room_id'. */
function resolvePath(path, params, result) {
  const [root, ...rest] = String(path).split('.')
  let value = 'params' === root ? params : 'result' === root ? result : undefined
  for (const step of rest) {
    if (null == value) return undefined
    value = value[step]
  }
  return value
}

/** [{aim:'cag'},{move:'segment'}] -> 'aim:cag,move:segment' */
function patternOf(pat) {
  return (pat || []).map((p) => Object.entries(p)[0].join(':')).join(',')
}

/**
 * The aim:web proxy that reaches a service pattern.
 *
 * THE DECLARED INVERSE IS NOT POSTABLE AS DECLARED. `inverse.pat` names the
 * SERVICE message (aim:cag,move:segment), and the browser bus is pinned to
 * aim:web - the only namespace the gateway accepts. Every inverse therefore
 * has to be translated, and an inverse whose proxy is not declared is an undo
 * that would fail silently the first time somebody pressed `u`.
 */
function proxyFor(pat) {
  const parts = (pat || []).map((p) => Object.entries(p)[0])
  if (2 > parts.length) return null
  const [[aimKey, srv], ...rest] = parts
  if ('aim' !== aimKey) return null

  const msg = { aim: 'web', on: srv }
  for (const [k, v] of rest) msg[k] = v
  return { msg, pattern: 'aim:web,on:' + srv + ',' + rest.map(([k, v]) => k + ':' + v).join(',') }
}

/**
 * Build the message that undoes one settled intent, or null when there is
 * none to build.
 *
 * `declared` is every pattern in the model - main.msg - so a missing proxy is
 * caught here rather than at the transport.
 *
 * Returns null when: the definition declares no inverse (PLATFORM 1.4: "not
 * undoable, and the UI must show it that way"), the inverse names no proxy we
 * can reach, or a mapped value is missing from the result - which means the
 * action stopped returning something its own contract names, and guessing
 * would post a half-built edit.
 */
export function buildInverse(def, params, result, declared = []) {
  if (null == def || null == def.inverse || null == def.inverse.pat) return null

  const proxy = proxyFor(def.inverse.pat)
  if (null == proxy) return null
  if (0 < declared.length && !declared.includes(proxy.pattern)) return null

  const map = def.inverse.map || {}
  const args = {}
  for (const [key, path] of Object.entries(map)) {
    const value = resolvePath(path, params, result)
    if (undefined === value) return null
    args[key] = value
  }

  return { ...proxy.msg, ...args }
}

/**
 * 'aim:cag,move:segment' -> { aim: 'web', on: 'cag', move: 'segment' }
 *
 * The one place a service pattern becomes something the browser may post.
 * aim:web is the only namespace the gateway accepts, and every entry in it is
 * a declared proxy (SPEC 9) - so this is a translation, never a widening.
 */
export function webMessage(servicePattern) {
  const parts = String(servicePattern).split(',').map((p) => p.split(':'))
  if (2 > parts.length) return null
  const [[aimKey, srv], ...rest] = parts
  if ('aim' !== aimKey) return null

  const msg = { aim: 'web', on: srv }
  for (const [k, v] of rest) msg[k] = v
  return msg
}

export { patternOf }


/**
 * The stack.
 *
 * ONLY SETTLED, OK RESULTS GO ON IT. An inverse map reads `result.*` -
 * `result.prev.room_id` is PLATFORM's own example - so there is nothing to
 * build from until the server has answered, and an entry pushed optimistically
 * would be a guess. This also removes the "rolled back after its inverse was
 * pushed" case entirely: a rollback never pushed anything.
 */
export function makeUndoStack(limit = 50) {
  let entries = []
  // Set while an undo is running, so the inverse of an inverse is not pushed
  // and `u` stays a stack walk rather than a two-state flip-flop. A module
  // flag and NOT a message field: @voxgig/system compiles params into a
  // CLOSED shape, so a stray `undo: true` is a refusal from the server.
  let applying = false

  return {
    get depth() { return entries.length },
    get applying() { return applying },

    /** Push the inverse of a settled ok intent. Label is what the toast says. */
    push(message, label) {
      if (applying || null == message) return false
      entries.push({ message, label })
      if (entries.length > limit) entries.shift()
      return true
    },

    /** The next thing `u` would undo, without removing it. */
    peek() {
      return entries.length ? entries[entries.length - 1] : null
    },

    /**
     * Run the top entry through `post`, and drop it only if it SETTLES ok.
     * A failed undo leaves the stack alone - the edit is still there to undo,
     * and silently discarding it would strand the organiser one step further
     * from where they wanted to be.
     */
    async pop(post) {
      const entry = this.peek()
      if (null == entry) return { ok: false, why: 'nothing-to-undo' }

      applying = true
      try {
        const out = await post(entry.message)
        if (out && out.ok) {
          entries.pop()
          return { ok: true, label: entry.label, out }
        }
        return { ok: false, why: (out && out.why) || 'undo-failed', label: entry.label }
      }
      finally {
        applying = false
      }
    },

    /**
     * Drop everything. The stack is principal- AND fixture-scoped: after a
     * sign-in as somebody else, or a switch to another conference, a stale
     * `u` posts a mutation against a row the organiser is not even looking
     * at. The server refuses it, but the UI would have claimed an undo
     * happened, which is worse than not offering one.
     */
    clear() {
      entries = []
    },
  }
}
