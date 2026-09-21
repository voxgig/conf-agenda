// THE AGENDA GRID (SPEC 13) - the screen that carries this product.
//
// Built to metsitaba/project-specs conf-agenda/mockups/src/Main.dc.html, which
// is this screen's acceptance criteria rather than decoration.
//
// A CSS GRID, NOT A TABLE. Sessions span arbitrary time ranges and float as
// cards with gaps between them; a table's cell model cannot draw that, and the
// rowspan bookkeeping it forced was where the grid once silently HID the second
// half of a double-booking. Grid placement is by coordinate, so nothing can be
// covered by anything else.
//
// Stage 1 depth: READ-ONLY. Rooms as columns, time as rows, keyboard focus, a
// command bar. Editing, drag-to-move, optimistic updates and undo are Stage 2,
// and they arrive as named intent messages (move:segment, set:status, ...) -
// never as an entity save composed in the browser (SPEC 9).
//
// Plain custom element, not Lit: SPEC 19.2 says build S1's grid this way and
// migrate when @voxgig/build carries Lit. The DOM-building is what Lit replaces.
//
// Data comes from aim:web,on:cag,load:tree - NOT the published snapshot. The
// organiser must see drafts, which agenda.json deliberately never contains.

import * as Api from '../../api.js'
import { bus, onEvent } from '../../bus.js'
import { msgFor, patterns } from '../../model.js'
import { buildInverse, makeUndoStack, webMessage } from '../../undo.js'
import { renderSyncPlan } from './sync_plan.js'
import { renderValidatePanel } from './validate_panel.js'
import { renderSyncRun } from './sync_run.js'

const STATUS_LABEL = { draft: 'Draft', confirmed: '', cancelled: 'Cancelled' }

// Kinds that read as an interval in the programme rather than a session with a
// speaker. The mockup draws these as a dashed band.
const BREAK_KINDS = new Set(['brk', 'mea'])

const HALF_HOUR = 30 * 60 * 1000

/**
 * The aim:web,on:cag messages that CHANGE something, read from the model.
 *
 * Derived rather than listed, so a new intent is followed automatically and
 * this cannot drift from msg.aon - which is the failure mode the whole
 * surface test exists for.
 */
const READ_VERBS = ['list', 'load', 'watch', 'plan', 'validate']

function mutationPatterns() {
  return patterns().filter((p) => {
    if (!p.startsWith('aim:web,on:cag,')) return false
    const verb = p.split(',').pop().split(':')[0]
    return !READ_VERBS.includes(verb)
  })
}

function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (null == v) continue
    if ('text' === k) node.textContent = String(v)
    else if ('class' === k) node.className = v
    else if ('style' === k) node.style.cssText = v
    else node.setAttribute(k, String(v))
  }
  for (const kid of [].concat(kids)) if (null != kid) node.appendChild(kid)
  return node
}

/** Wall time in the conference zone, via Intl - no date library (SPEC 8.3). */
function clockFor(tzn) {
  let fmt
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzn || 'UTC',
    })
  } catch (e) {
    fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return (ms) => (null == ms ? '' : fmt.format(new Date(ms)))
}

/** "2h ago", "3 days ago" - enough precision for a publish timestamp. */
function ago(ms) {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours + 'h ago'
  const days = Math.round(hours / 24)
  return days + (1 === days ? ' day ago' : ' days ago')
}

/**
 * Split one room's sessions into overlap clusters. A cluster of one is a plain
 * card; a cluster of more is a double-booking, and both members must stay
 * visible - that collision is the single thing this screen exists to surface.
 */
function clusters(sessions) {
  const sorted = sessions.slice().sort((a, b) => a.t_start - b.t_start)
  const out = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    // Half-open intervals: touching is not overlapping. A session ending at
    // 10:00 and one starting at 10:00 are two clusters, not a clash.
    if (last && s.t_start < last.end) {
      last.items.push(s)
      last.end = Math.max(last.end, s.t_end)
    } else {
      out.push({ start: s.t_start, end: s.t_end, items: [s] })
    }
  }
  return out
}

class VgViewCagFixture extends HTMLElement {
  constructor() {
    super()
    this.focusIndex = 0
    this.fixtureId = null
    this.dayId = null
    // 'grid' | 'sync' | 'run' | 'validate'. Each is a thing you do TO a
    // conference rather than a place you navigate to, which is why they are
    // keystrokes and not nav items.
    this.mode = 'grid'
    this.onKey = this.onKey.bind(this)

    // Undo is a log of INVERSE MESSAGES, not a stack of snapshots - see
    // src/undo.js. Cleared whenever the scope changes, because a stale entry
    // posts an edit against a row the organiser is no longer looking at.
    this.undo = makeUndoStack()

    // SINGLE-FLIGHT. One mutation in the air at a time; the next queues
    // behind it. Without this, two fast Shift-arrows reconcile
    // last-response-wins - a visible ghost move - and the undo stack ends up
    // ordered by when the server answered rather than by what the organiser
    // did, so `u` undoes the wrong one.
    this.pending = null

    // The origin slot's "moved from here" placeholder, and the toast that
    // names the move. Both are cleared when the move settles.
    this.ghost = null
    this.toast = null

    // Live validation (SPEC 19.4), re-run after every settled intent. The
    // header shows the count; the panel is a separate piece of work.
    this.diagnostics = []
    // Which diagnostic the panel's ring is on. Separate from focusIndex:
    // walking the list must not move the grid's selection until Enter says so.
    this.diagIndex = 0
  }

  connectedCallback() {
    this.tabIndex = 0
    this.addEventListener('keydown', this.onKey)

    // Opening a named conference is a MESSAGE, not only a <select>. Same
    // reason the nav links post one: a journey that needs a pointer is a
    // journey the bus-drive spec cannot prove (PLATFORM 10).
    onEvent('conference', ({ fixture_id }) => {
      if (!this.isConnected || null == fixture_id) return
      this.openConference(fixture_id)
    })

    // THE GRID FOLLOWS THE BUS, NOT ONLY ITS OWN METHOD CALLS.
    //
    // Every mutation used to reach the grid through mutate(), which is what
    // invalidates the cache and reloads - so a message posted from anywhere
    // else changed the database and left the screen showing the old world.
    // The bus-drive spec found it immediately: make:segment succeeded and no
    // card appeared. That is the difference between a UI that IS
    // message-driven and one that was built that way once (PLATFORM 10).
    //
    // `sub` and not `add`: many observers per pattern, and it does not
    // intercept the message. It fires when the message is SENT, so the
    // refresh is debounced past the round-trip rather than racing it.
    for (const pattern of mutationPatterns()) {
      bus.sub(pattern, () => this.onBusMutation())
    }
  }

  /** A mutation went past on the bus. If it was ours, mutate() settles it. */
  onBusMutation() {
    // bus.sub has no auto-unsubscribe (web/AGENTS.md), so a detached grid
    // would otherwise keep reloading for the life of the page.
    if (!this.isConnected) return
    if (null != this.pending) return

    clearTimeout(this.busTimer)
    this.busTimer = setTimeout(() => {
      if (this.isConnected && 'grid' === this.mode) this.settle()
    }, 250)
  }

  /** Switch to a conference by id, from the picker or from a message. */
  openConference(fixture_id) {
    this.fixtureId = fixture_id
    this.dayId = null
    // The stack is fixture-scoped - see the picker's own note.
    this.undo.clear()
    this.diagnostics = []
    return this.reload()
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.onKey)
    this.stopPolling()
  }

  navigate(canon, id) {
    if (this.onNavigate) this.onNavigate(canon, id)
  }

  async reload(focusId) {
    const msg = { aim: 'web', on: 'cag', load: 'tree' }
    if (this.fixtureId) msg.fixture_id = this.fixtureId
    const r = await bus.post(msg)
    if (!r || !r.ok) {
      this.replaceChildren(
        el('div', { class: 'vg-entity' }, [
          el('p', { class: 'vg-muted', text: 'The agenda could not be loaded.' }),
        ]),
      )
      return
    }
    this.data = r
    this.fixtureId = r.top ? r.top.id : null
    // THE ADMIN'S CREATES NEED A CONFERENCE. A new room has no stored row to
    // take a tenant from, so it names one - and this grid is where the app
    // learns which conference the organiser is working on.
    Api.setConference(this.fixtureId)
    // Days are a grouping, not an entity (SPEC 8.1) - a day is an ordinary
    // intermediate fixture, so a conference may have none.
    const days = this.days
    if (!days.some((d) => d.id === this.dayId)) this.dayId = days.length ? days[0].id : null

    // FOCUS FOLLOWS THE SESSION, not the index. A move reorders the list -
    // that is what moving in time means - so keeping the index would leave
    // the ring on whatever slid into that position, which is exactly the
    // ring-and-panel disagreement paintFocus already exists to prevent.
    const at = null == focusId ? -1 : this.sessions.findIndex((x) => x.id === focusId)
    this.focusIndex = 0 <= at ? at : Math.min(this.focusIndex, Math.max(0, this.sessions.length - 1))
    this.render()

    // THE COUNT IS PART OF LOADING THE GRID, not a consequence of editing. A
    // conference that is already invalid - and the seeded one is, deliberately
    // - must say so the moment it opens, or the organiser discovers it at
    // publish time instead.
    await this.revalidate()
  }

  /** Rooms as columns, in the order the grid draws them. */
  get roomList() {
    return (this.data.rooms || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  /** Wall time in the conference zone (SPEC 8.3). */
  clock(ms) {
    return clockFor((this.data.top || {}).t_tzn)(ms)
  }

  /** Errors first, warnings after - the header names the first and counts the rest. */
  get errorCount() {
    return this.diagnostics.filter((d) => 'error' === d.severity).length
  }

  /**
   * POST ONE INTENT, AND SETTLE EVERYTHING THAT FOLLOWS FROM IT.
   *
   * Every mutation in this component goes through here, and so does every
   * undo - which is what makes "always invalidate, always reload, never touch
   * the stack on failure" one rule rather than six call sites that each
   * remember most of it.
   *
   * `service` is the SERVICE pattern (aim:cag,move:segment). webMessage turns
   * it into the aim:web proxy the browser is allowed to post; the gateway
   * accepts nothing else.
   */
  async mutate(service, args, label) {
    // SINGLE-FLIGHT. Queue behind whatever is already in the air, so the
    // stack ends up ordered by what the organiser did rather than by when the
    // server happened to answer.
    while (this.pending) {
      try { await this.pending } catch (e) { /* reported by its own caller */ }
    }

    const base = webMessage(service)
    if (null == base) return { ok: false, why: 'bad-intent' }

    const run = bus.post({ ...base, ...args })
    this.pending = run

    let out
    try { out = await run }
    catch (e) { out = { ok: false, why: 'transport-failed' } }
    finally { this.pending = null }

    if (out && out.ok) {
      // ONLY NOW. An inverse map reads `result.*`, so before the answer there
      // is nothing to build and anything pushed would be a guess. This is
      // also why a rolled-back write never has to be un-pushed.
      const inverse = buildInverse(msgFor(service), args, out, patterns())
      this.undo.push(inverse, label)
      this.say(label, null != inverse)
    } else {
      this.say('Could not ' + label + ' \u2014 ' + ((out && out.why) || 'unknown'), false)
    }

    await this.settle(out && out.ok && out.item ? out.item.id : args.fixture_id)
    return out
  }

  /**
   * Drop the grid's cached read, refetch, and recount the diagnostics.
   *
   * THE STORE CANNOT DO THIS FOR US, and no entry in its `write` verb list
   * ever could. Its cache group is zone / on / <value of the verb key>, so
   * the grid's read is `web/cag/tree` while move:segment is
   * `web/cag/segment` - different groups, and invalidateGroup matches
   * exactly. Adding 'move' to the write list changes which group is dropped,
   * never which read is refreshed, so web/src/bus.js is deliberately left
   * alone and the invalidation is explicit here.
   *
   * ON FAILURE TOO. A rejected write heals only the write's OWN group, so the
   * grid would otherwise keep both its wrong optimistic state and its stale
   * tree - and the optimistic state is the one the organiser is looking at.
   */
  async settle(focusId) {
    this.ghost = null
    try {
      await bus.act('sys:browser-store,invalidate:group', { group: 'web/cag/tree' })
    } catch (e) {
      // No store registered (a bare test page). The reload below is the point.
    }
    // reload() recounts the diagnostics itself.
    await this.reload(focusId)
  }

  /**
   * Live validation (SPEC 19.4), for the header's error count.
   *
   * A SECOND ROUND-TRIP ON PURPOSE. The count has to be the server's answer:
   * a browser that recomputed room-double-booked would be reimplementing the
   * rule, and the two would drift. It arrives a moment after the move lands,
   * which is honest - the move is optimistic, the verdict is not.
   */
  async revalidate() {
    if (null == this.fixtureId) return
    let r
    try {
      r = await bus.post({
        aim: 'web', on: 'cag', validate: 'fixture', fixture_id: this.fixtureId,
      })
    } catch (e) {
      return
    }
    this.diagnostics = (r && r.ok && r.diagnostics) || []
    if (this.isConnected && 'grid' === this.mode) this.render()
  }

  /** The toast. It NAMES the move - "Saved" tells an organiser nothing. */
  say(text, undoable) {
    this.toast = { text, undoable }
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toast = null
      if (this.isConnected && 'grid' === this.mode) this.render()
    }, 6000)
  }

  // ---- the intents -------------------------------------------------------
  // Each builds the TARGET and posts it. None of them computes the new row:
  // the server decides what a move means, and a browser that decided would be
  // the business rule, unreviewably (PLATFORM 1.2).

  /** Optimistic: move the card now, reconcile when the server answers. */
  applyMoveLocally(id, room_id, t_start) {
    const seg = (this.data.segments || []).find((x) => x.id === id)
    if (null == seg) return
    this.ghost = {
      id, title: seg.title, room_id: seg.room_id,
      t_start: seg.t_start, t_end: seg.t_end,
    }
    const span = (seg.t_end || t_start) - (seg.t_start || t_start)
    if (null != room_id) seg.room_id = room_id
    seg.t_start = t_start
    seg.t_end = t_start + span
    this.render()
  }

  async moveSegment(session, room_id, t_start) {
    if (null == session) return
    const rooms = this.roomList
    const name = (rooms.find((r) => r.id === room_id) || {}).name || room_id
    const label = 'Moved ' + (session.title || session.id) +
      ' \u2192 ' + name + ' \u00b7 ' + this.clock(t_start)

    this.applyMoveLocally(session.id, room_id, t_start)
    await this.mutate('aim:cag,move:segment',
      { fixture_id: session.id, room_id, t_start }, label)
  }

  /** `Shift`-arrows: one room sideways, one slot up or down. */
  async nudge(session, dx, dy) {
    if (null == session) return
    const rooms = this.roomList
    if (0 === rooms.length) return

    let room_id = session.room_id
    if (0 !== dx) {
      const at = rooms.findIndex((r) => r.id === session.room_id)
      const next = Math.min(rooms.length - 1, Math.max(0, (at < 0 ? 0 : at) + dx))
      room_id = rooms[next].id
    }
    const t_start = (session.t_start || 0) + dy * HALF_HOUR
    await this.moveSegment(session, room_id, t_start)
  }

  async cycleStatus(session) {
    if (null == session) return
    // draft -> confirmed -> cancelled -> draft. The CYCLE is the UI's; the
    // message takes the status it is moving to, which is what gives it an
    // inverse worth declaring.
    const order = ['draft', 'confirmed', 'cancelled']
    const at = order.indexOf(String(session.status || 'draft'))
    const status = order[(at < 0 ? 0 : at + 1) % order.length]
    await this.mutate('aim:cag,set:status',
      { fixture_id: session.id, status },
      (session.title || session.id) + ' \u2192 ' + status)
  }

  async duplicateSegment(session) {
    if (null == session) return
    await this.mutate('aim:cag,duplicate:segment', { fixture_id: session.id },
      'Duplicated ' + (session.title || session.id))
  }

  /** `n`: a new session beside the focused one, in the same room. */
  async makeSegment(session) {
    const parent_id = null == session ? this.dayId || this.fixtureId : session.parent_id
    if (null == parent_id) return

    const t_start = null == session
      ? (this.data.top || {}).t_start
      : session.t_end
    if (null == t_start) return

    await this.mutate('aim:cag,make:segment', {
      parent_id,
      room_id: null == session ? undefined : session.room_id,
      t_start,
      t_end: t_start + HALF_HOUR,
    }, 'New session')
  }

  /** `u`: run the top inverse, as an ordinary edit. */
  async undoLast() {
    // AWAIT THE IN-FLIGHT MUTATION FIRST. Its inverse is not on the stack
    // until it settles, so undoing "now" would undo the one before it - an
    // action the organiser is not looking at.
    while (this.pending) {
      try { await this.pending } catch (e) { /* reported by its own caller */ }
    }

    if (0 === this.undo.depth) {
      this.say('Nothing to undo', false)
      this.render()
      return
    }

    const out = await this.undo.pop((message) => bus.post(message))
    this.say(out.ok ? 'Undone \u00b7 ' + out.label
      : 'Could not undo \u2014 ' + out.why, false)

    // FOCUS FOLLOWS THE SESSION THAT CAME BACK. An undo that lands the ring
    // on whatever happens to sit at the old index is the ring-and-panel
    // disagreement again, one step removed - and the organiser's eye is
    // already on the card they just restored.
    const restored = out.ok && out.out && out.out.item ? out.out.item.id : undefined
    await this.settle(restored)
  }

  /** Intermediate `day` fixtures, in programme order. */
  get days() {
    return (this.data.segments || [])
      .filter((s) => 'day' === s.kind)
      .sort((a, b) => (a.t_start || 0) - (b.t_start || 0))
  }

  /** Sessions on the selected day, in grid order - the order j/k walks. */
  get sessions() {
    const segs = (this.data.segments || []).filter(
      (s) => 'day' !== s.kind && null != s.t_start,
    )
    const scoped = null == this.dayId ? segs : segs.filter((s) => s.parent_id === this.dayId)
    return scoped.sort((a, b) => a.t_start - b.t_start || (a.id < b.id ? -1 : 1))
  }

  onKey(ev) {
    // THE PANEL OWNS j/k/Enter WHILE IT IS OPEN. Same vocabulary, different
    // list - walking diagnostics must not drag the grid's selection with it,
    // which is why diagIndex is separate from focusIndex.
    if ('validate' === this.mode) {
      if ('Escape' === ev.key || 'v' === ev.key) {
        ev.preventDefault()
        this.showGrid()
      } else if ('j' === ev.key) {
        ev.preventDefault()
        this.diagIndex = Math.min(this.diagIndex + 1, Math.max(0, this.diagnostics.length - 1))
        this.render()
      } else if ('k' === ev.key && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault()
        this.diagIndex = Math.max(this.diagIndex - 1, 0)
        this.render()
      } else if ('Enter' === ev.key) {
        ev.preventDefault()
        this.jumpToDiagnostic()
      }
      return
    }

    if ('grid' !== this.mode) {
      if ('Escape' === ev.key) { ev.preventDefault(); this.showGrid() }
      return
    }

    const list = this.sessions
    // `n` and `u` are the two that mean something on an EMPTY day - which is
    // exactly the day you most want to add a session to.
    if (0 === list.length && 'n' !== ev.key && 'u' !== ev.key) return

    // S: the sync plan. Read-only and it sends nothing - see sync_plan.js.
    if ('S' === ev.key) {
      ev.preventDefault()
      this.showSync()
      return
    }

    // Cmd-K/Ctrl-K FIRST. The modifier check has to come before the bare
    // 'k' case, because ev.key is still 'k' when the modifier is held - test
    // plain 'k' first and the command bar is unreachable, which is exactly
    // what happened here.
    if ('k' === ev.key.toLowerCase() && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault()
      this.toggleBar()
      return
    }

    // SHIFT-ARROWS BEFORE THE BARE KEYS, and for the same reason Cmd-K goes
    // before 'k': a modifier does not change ev.key, so anything that tests
    // the plain key first wins and the modified binding is unreachable. That
    // is not hypothetical here - it is what kept Cmd-K dead for its whole
    // life, and e2e/grid-keys.spec.js exists because of it.
    const ARROW = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }
    if (ev.shiftKey && ARROW[ev.key]) {
      ev.preventDefault()
      const [dx, dy] = ARROW[ev.key]
      this.nudge(list[this.focusIndex], dx, dy)
      return
    }

    // The editing keys (SPEC 13.1). Each posts a NAMED INTENT; none of them
    // computes a row.
    if ('n' === ev.key) {
      ev.preventDefault()
      this.makeSegment(list[this.focusIndex])
      return
    }
    if ('d' === ev.key) {
      ev.preventDefault()
      this.duplicateSegment(list[this.focusIndex])
      return
    }
    if ('t' === ev.key) {
      ev.preventDefault()
      this.cycleStatus(list[this.focusIndex])
      return
    }
    if ('u' === ev.key) {
      ev.preventDefault()
      this.undoLast()
      return
    }
    if ('v' === ev.key) {
      ev.preventDefault()
      this.showValidation()
      return
    }

    // j/k/Enter are the SHARED vocabulary (PLATFORM 5.2) - the same keys mean
    // the same things in both apps. Focus is always somewhere and always
    // visible (K8).
    if ('j' === ev.key) {
      this.focusIndex = Math.min(this.focusIndex + 1, list.length - 1)
    } else if ('k' === ev.key) {
      this.focusIndex = Math.max(this.focusIndex - 1, 0)
    } else if ('Enter' === ev.key) {
      this.openDetail(list[this.focusIndex])
      return
    } else if ('?' === ev.key) {
      this.toggleHelp()
      return
    } else {
      return
    }
    ev.preventDefault()
    this.paintFocus()
  }

  /**
   * `v`: the diagnostics list.
   *
   * It REVALIDATES on open rather than trusting what the header happens to be
   * showing. The count is refreshed after every settled intent, but the panel
   * is also the thing an organiser opens after doing nothing for ten minutes,
   * and "validate now" is what SPEC 13.1 says `v` means.
   */
  async showValidation() {
    await this.revalidate()
    this.diagIndex = 0
    this.mode = 'validate'
    this.render()
    this.focus()
  }

  /**
   * `Enter`: go to the session a diagnostic is about.
   *
   * The diagnostic names its anchor entity, so this is a lookup rather than a
   * search - and if the anchor is not a session on the current day (a clash
   * spanning two days, a rule about the conference itself) it says so instead
   * of silently landing somewhere arbitrary.
   */
  jumpToDiagnostic() {
    const d = this.diagnostics[this.diagIndex]
    if (null == d || null == d.entity) return

    const at = this.sessions.findIndex((s) => s.id === d.entity.id)
    if (at < 0) {
      // Most often: the diagnostic is on another day. Changing the day under
      // the organiser without saying so is worse than not moving.
      this.say('That one is not on this day — ' + d.rule, false)
      this.render()
      return
    }

    this.focusIndex = at
    this.mode = 'grid'
    this.render()
    this.openDetail(this.sessions[at])
    this.focus()
  }

  showGrid() {
    this.mode = 'grid'
    this.stopPolling()
    this.render()
    this.focus()
  }

  stopPolling() {
    if (this.poll) { clearTimeout(this.poll); this.poll = null }
  }

  /**
   * Apply the confirmed plan, then watch the run.
   *
   * The confirmation is the click: the button states the counts, which is C4's
   * "explicit confirmation stating the invitation and recipient counts". It is
   * not defaulted anywhere below - a confirmation that can be lost in transit
   * is not a confirmation.
   */
  async applySync() {
    const r = await bus.post({
      aim: 'web', on: 'cag', apply: 'sync', fixture_id: this.fixtureId, confirm: true,
    })
    if (!r || !r.ok || !r.run_id) {
      const why = (r && r.why) || 'unknown'
      const note = this.querySelector('[data-apply-note]')
      // Name the refusal. 'sync-in-progress' and 'outbound-cap-exceeded' are
      // different problems with different answers.
      if (note) note.textContent = 'Not applied: ' + why
      return
    }
    this.runId = r.run_id
    this.mode = 'run'
    this.watchRun()
  }

  async watchRun() {
    if ('run' !== this.mode || null == this.runId) return
    // watch: and not get: - the SPA's transparent cache treats a `get` as a
    // cacheable read and only invalidates on a client write, so a run that
    // changes on the SERVER was cached "pending" for ever. See
    // backend/src/srv/cag/web_watch_run.ts.
    const r = await bus.post({ aim: 'web', on: 'cag', watch: 'run', run_id: this.runId })
    // RE-CHECK AFTER THE AWAIT. disconnectedCallback calls stopPolling, but a
    // disconnect DURING the post above clears a timer that does not exist
    // yet - and the line below then schedules a fresh one, so a detached
    // component polls watch:run every second for the life of the page. The
    // same render-token reasoning as cmp/admin.js, and `run` is a poll rather
    // than a cached read precisely so it reaches the server every time.
    if (!this.isConnected || 'run' !== this.mode) return
    if (!r || !r.ok) return
    const running = renderSyncRun(this, r, () => this.showGrid())
    this.stopPolling()
    // Poll only while something can still change. A screen that keeps asking
    // after the run has settled is a screen that never lets the process idle.
    if (running) this.poll = setTimeout(() => this.watchRun(), 1000)
  }

  async showSync() {
    const r = await bus.post({ aim: 'web', on: 'cag', plan: 'sync', fixture_id: this.fixtureId })
    if (!r || !r.ok) {
      // Say which failure it was. "Could not load" covers a missing
      // conference and a broken backend equally badly.
      this.replaceChildren(el('div', { class: 'vg-entity' }, [
        el('p', { class: 'vg-muted', text: 'The sync plan could not be built: ' + ((r && r.why) || 'unknown') }),
      ]))
      return
    }
    this.mode = 'sync'
    renderSyncPlan(this, r, () => this.showGrid(), () => this.applySync())
  }

  paintFocus() {
    // Match on data-index, NOT on DOM position. Cards are appended room by
    // room, so DOM order is room-major while focusIndex walks the sessions in
    // TIME order - on a single-room day the two happen to agree, and on any
    // conference with more than one room they do not. Comparing positions put
    // the ring on one session while the detail panel described another.
    const cells = [...this.querySelectorAll('[data-session]')]
    cells.forEach((c) => {
      const on = Number(c.getAttribute('data-index')) === this.focusIndex
      c.classList.toggle('vg-focus', on)
      if (on) c.scrollIntoView({ block: 'nearest' })
    })
    const s = this.sessions[this.focusIndex]
    const live = this.querySelector('[data-live]')
    // An ARIA live region, so a screen reader hears the move (K10).
    if (live && s) live.textContent = (s.title || s.id) + ', ' + (s.effective_status || '')
  }

  openDetail(session) {
    if (!session) return
    const panel = this.querySelector('[data-detail]')
    if (!panel) return
    panel.hidden = false
    const speakers = new Map((this.data.speakers || []).map((s) => [s.id, s.name]))
    const names = (this.data.appearances || [])
      .filter((a) => a.fixture_id === session.id)
      .map((a) => speakers.get(a.speaker_id) || a.speaker_id)
    const clock = clockFor(this.data.top && this.data.top.t_tzn)
    const room = (this.data.rooms || []).find((r) => r.id === session.room_id)

    // replaceChildren stringifies anything that is not a Node, so a null
    // child renders the literal text "null". Filter before it, not inside el().
    panel.replaceChildren(...[
      el('h3', { text: session.title || session.id }),
      el('p', { class: 'vg-muted', text:
        clock(session.t_start) + '–' + clock(session.t_end) +
        (room ? ' · ' + (room.name || room.id) : '') +
        ' · ' + (session.kind || '') +
        ' · ' + (session.effective_status || '') +
        (names.length ? ' · ' + names.join(', ') : '') }),
      session.desc ? el('p', { text: session.desc }) : null,
      // The bindings that act on THIS session, where somebody who reached it
      // with the mouse will see them. The panel is the discovery route for
      // the keyboard model, not a second way of doing things.
      el('p', { class: 'vg-muted', text:
        'Shift-arrows move · t cycles status · d duplicates · u undoes' }),
    ].filter((n) => null != n))
  }

  toggleHelp() {
    const h = this.querySelector('[data-help]')
    if (h) h.hidden = !h.hidden
  }

  toggleBar() {
    const bar = this.querySelector('[data-bar]')
    if (!bar) return
    bar.hidden = !bar.hidden
    if (!bar.hidden) bar.querySelector('input').focus()
  }

  /** Three commands, hard-coded until the binding registry lands (SPEC 19.2). */
  commands() {
    return [
      { key: 'r', label: 'Reload agenda', run: () => this.reload() },
      { key: 'g', label: 'Go to first session', run: () => { this.focusIndex = 0; this.paintFocus() } },
      { key: '?', label: 'Show shortcuts', run: () => this.toggleHelp() },
    ]
  }

  /**
   * The toast, which IS the undo affordance.
   *
   * It names what happened - "Moved Message Buses in the Browser -> Liffey B
   * · 10:00" - rather than saying "Saved". An organiser who has just moved
   * three things needs to know WHICH one this is offering to put back, and
   * `u` is offered only when the intent actually declared an inverse.
   */
  renderToast() {
    if (null == this.toast) return null
    return el('div', { class: 'ca-toast', role: 'status' }, [
      el('span', { text: this.toast.text }),
      this.toast.undoable
        ? el('span', { class: 'ca-toast-undo' }, [
          el('span', { class: 'vg-kbd', text: 'u' }),
          el('span', { text: ' undo' }),
        ])
        : null,
    ])
  }

  /** Conference picker, day pills and publish state - the mockup's header. */
  renderHead(top, list) {
    const tops = this.data.tops || []
    const kids = []

    if (1 < tops.length) {
      const sel = el('select', { class: 'ca-confsel', 'aria-label': 'Conference' },
        tops.map((t) => el('option', { value: t.id, text: t.title || t.id })))
      sel.value = top.id
      // The stack is fixture-scoped. A `u` left over from the last conference
      // posts an edit against a row nobody is looking at - the server refuses
      // it, but the UI would have claimed an undo happened. openConference
      // clears it, whichever route got here.
      sel.addEventListener('change', () => this.openConference(sel.value))
      kids.push(sel)
    } else {
      kids.push(el('h2', { class: 'ca-confsel', text: top.title || top.id }))
    }

    const days = this.days
    if (days.length) {
      const clock = clockFor(top.t_tzn)
      kids.push(el('div', { class: 'ca-days' }, days.map((d) => {
        const b = el('button', {
          type: 'button', class: 'ca-day',
          'aria-pressed': String(d.id === this.dayId),
          text: d.title || clock(d.t_start),
        })
        b.addEventListener('click', () => {
          this.dayId = d.id
          this.focusIndex = 0
          this.render()
        })
        return b
      })))
    }

    // Publish state. Both halves are computed from real data upstream - a
    // conference that has never published says so rather than showing a zero.
    const pub = this.data.publish
    const state = el('div', { class: 'ca-pubstate' })
    if (pub && null != pub.published_at) {
      state.appendChild(el('span', { text: 'Published ' + ago(pub.published_at) }))
      if (0 < pub.unpublished) {
        state.appendChild(el('span', { text: ' · ' }))
        state.appendChild(el('span', { class: 'ca-dirty',
          text: pub.unpublished + (1 === pub.unpublished ? ' unpublished change' : ' unpublished changes') }))
      }
    } else {
      state.appendChild(el('span', { class: 'ca-never', text: 'Not published' }))
    }
    state.appendChild(el('span', { text: ' · ' + list.length + ' sessions' }))
    kids.push(state)

    // THE ERROR COUNT, and it names the first rule rather than only counting.
    // "2 errors" sends an organiser looking; "2 errors — room-double-booked
    // +1" tells them where to start. Publication is blocked while any remain
    // (SPEC 16), which is what makes this the header's business and not a
    // panel's.
    const errors = this.diagnostics.filter((d) => 'error' === d.severity)
    if (0 < errors.length) {
      const rest = errors.length - 1
      kids.push(el('div', { class: 'ca-errpill', 'data-errors': String(errors.length) }, [
        el('span', { class: 'ca-errdot', 'aria-hidden': 'true' }),
        el('b', { text: errors.length + (1 === errors.length ? ' error' : ' errors') }),
        el('span', { text: ' — ' + errors[0].rule + (0 < rest ? ' +' + rest : '') }),
      ]))
    }

    return el('div', { class: 'ca-head' }, kids)
  }

  render() {
    const top = this.data.top
    if (null == top) {
      this.replaceChildren(
        el('div', { class: 'vg-entity' }, [
          el('h2', { text: 'Agenda' }),
          el('p', { class: 'vg-muted', text: 'No conference yet.' }),
        ]),
      )
      return
    }

    const clock = clockFor(top.t_tzn)
    const speakers = new Map((this.data.speakers || []).map((s) => [s.id, s.name]))
    const tracks = new Map((this.data.tracks || []).map((t) => [t.id, t]))
    const appearances = this.data.appearances || []
    const rooms = (this.data.rooms || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    const list = this.sessions
    const order = new Map(list.map((s, i) => [s.id, i]))

    // Every boundary any session touches becomes a row edge, so a 10:15 start
    // lands exactly. Row HEIGHT is then proportional to that slot's real
    // duration - a 15-minute gap is visibly shorter than an hour - which is
    // what makes the ladder read as time rather than as a list.
    // The ghost's ORIGINAL slot is a row edge too, or rowsFor cannot place it
    // - the session has already moved away from those times optimistically.
    const ghostMarks = this.ghost ? [this.ghost.t_start, this.ghost.t_end] : []
    const marks = [...new Set(list.flatMap((s) => [s.t_start, s.t_end]).concat(ghostMarks))]
      .sort((a, b) => a - b)
    const rowIndex = new Map(marks.map((m, i) => [m, i]))
    const heights = []
    for (let i = 0; i < marks.length - 1; i++) {
      const px = Math.round(62 * ((marks[i + 1] - marks[i]) / HALF_HOUR))
      // Capped: a three-hour workshop is genuinely long, but letting it draw
      // to scale pushes everything else off the screen and leaves the grid
      // mostly empty. Past ~2.5 slots the extra height stops carrying
      // information.
      heights.push(Math.min(155, Math.max(30, px)) + 'px')
    }

    const grid = el('div', {
      class: 'vg-grid ca-grid',
      role: 'list',
      'aria-label': 'Agenda for ' + (top.title || top.id),
      style: 'grid-template-columns: 64px repeat(' + Math.max(1, rooms.length) +
        ', minmax(0, 1fr)); grid-template-rows: 30px ' + heights.join(' ') + ';',
    })

    // Room headers, then the time gutter.
    rooms.forEach((r, c) => {
      grid.appendChild(el('div', {
        class: 'ca-roomh', 'aria-hidden': 'true',
        style: 'grid-column: ' + (c + 2) + '; grid-row: 1;',
        text: r.name || r.id,
      }))
    })
    for (let i = 0; i < marks.length - 1; i++) {
      grid.appendChild(el('div', {
        class: 'ca-timel', 'aria-hidden': 'true',
        style: 'grid-column: 1; grid-row: ' + (i + 2) + ';',
        text: clock(marks[i]),
      }))
    }

    // EMPTY SLOTS, one per (room x row). They are the drop targets, and they
    // are appended BEFORE the cards so a card is always on top of the slot it
    // sits in. Without them a drag has nowhere to land - the grid draws only
    // what is occupied.
    rooms.forEach((r, c) => {
      for (let i = 0; i < marks.length - 1; i++) {
        grid.appendChild(el('div', {
          class: 'ca-slot', 'aria-hidden': 'true',
          'data-slot': '', 'data-room': r.id, 'data-start': String(marks[i]),
          style: 'grid-column: ' + (c + 2) + '; grid-row: ' + (i + 2) + ';',
        }))
      }
    })

    const rowsFor = (start, end) => {
      const a = rowIndex.get(start)
      const b = rowIndex.get(end)
      const from = (null == a ? 0 : a) + 2
      const span = Math.max(1, (null == b ? (null == a ? 1 : a + 1) : b) - (null == a ? 0 : a))
      return 'grid-row: ' + from + ' / span ' + span + ';'
    }

    const sessionNode = (s) => {
      const names = appearances
        .filter((a) => a.fixture_id === s.id)
        .map((a) => speakers.get(a.speaker_id) || a.speaker_id)
      const badge = STATUS_LABEL[s.effective_status] || ''
      const track = tracks.get(s.track_id)
      const room = rooms.find((r) => r.id === s.room_id)
      const time = clock(s.t_start) + '–' + clock(s.t_end)

      const cls = ['ca-seg', 'vg-session']
      if ('cancelled' === s.effective_status) cls.push('ca-cancelled')
      if ('draft' === s.effective_status) cls.push('ca-draft')

      const node = el('div', {
        'data-session': s.id,
        'data-index': order.get(s.id),
        // The room it is IN, as an id rather than a computed column. A card
        // inside a clash wrapper has no grid column of its own, so the layout
        // cannot be asked where it sits.
        'data-room': s.room_id || '',
        class: cls.join(' '),
        role: 'listitem',
        // Drag is the pointer's route to move:segment - the SAME message
        // Shift-arrows posts. The grid must stay fully operable from the
        // keyboard (SPEC 13.1), so drag is the alternative, never the only way.
        draggable: 'true',
        // A CSS grid has no table semantics, so each card carries its own
        // context: a screen reader hears room and time without the header row.
        'aria-label': [
          s.title || s.id, room ? room.name || room.id : null, time,
          badge || null, names.length ? names.join(', ') : null,
        ].filter(Boolean).join(', '),
        // The track's colour drives the top strip and the chip. It is
        // organiser data, not theme - see model/ent.aon.
        style: track && track.color ? '--ca-track: ' + track.color + ';' : null,
      }, [
        el('div', { class: 'ca-seg-strip', 'aria-hidden': 'true' }),
        // .vg-strong is kept as a hook: web/e2e/grid-keys.spec.js selects on
        // it, so the keyboard model stays pinned across this rebuild.
        el('div', { class: 'ca-seg-title vg-strong', text: s.title || s.id }),
        names.length ? el('div', { class: 'ca-seg-meta', text: names.join(', ') }) : null,
        el('div', { class: 'ca-seg-meta', text: time }),
        // Status is shown as a WORD, never as colour alone (K10).
        badge ? el('div', { class: 'ca-seg-meta', text: badge }) : null,
        track ? el('div', { class: 'ca-seg-chip', text: track.name || track.id }) : null,
      ])
      return node
    }

    // A break with no room is an interval in the whole programme, so it spans
    // every room column, as the mockup draws Coffee. One that holds a room
    // stays in its column - `cancelled-holds-room` exists because that is a
    // real and deliberate thing to do.
    const spanning = list.filter((s) => BREAK_KINDS.has(s.kind) && null == s.room_id)
    for (const s of spanning) {
      grid.appendChild(el('div', {
        class: 'ca-break', 'data-session': s.id, 'data-index': order.get(s.id),
        role: 'listitem',
        'aria-label': [s.title || s.id, clock(s.t_start) + '–' + clock(s.t_end)].join(', '),
        style: 'grid-column: 2 / span ' + Math.max(1, rooms.length) + '; ' +
          rowsFor(s.t_start, s.t_end),
        text: (s.title || s.id) + ' — ' + clock(s.t_start) + '–' + clock(s.t_end),
      }))
    }

    for (const [c, room] of rooms.entries()) {
      const mine = list.filter((s) => s.room_id === room.id)
      for (const cluster of clusters(mine)) {
        const style = 'grid-column: ' + (c + 2) + '; ' + rowsFor(cluster.start, cluster.end)
        if (1 === cluster.items.length) {
          const node = sessionNode(cluster.items[0])
          node.style.cssText += style
          if (BREAK_KINDS.has(cluster.items[0].kind)) node.classList.add('ca-seg-break')
          grid.appendChild(node)
        } else {
          // A double-booking. Both cards inside one tinted, ruled container -
          // neither is ever hidden behind the other.
          const wrap = el('div', { class: 'ca-slot-clash', style })
          for (const s of cluster.items) wrap.appendChild(sessionNode(s))
          grid.appendChild(wrap)
        }
      }
    }

    // THE GHOST. The origin slot keeps a "moved from here" placeholder until
    // the move settles, with the original row span - so the grid does not
    // reflow under the pointer while the server is still answering, and the
    // organiser can see what they picked up and from where.
    if (this.ghost) {
      const gcol = rooms.findIndex((r) => r.id === this.ghost.room_id)
      grid.appendChild(el('div', {
        class: 'ca-ghost', 'aria-hidden': 'true', 'data-ghost': this.ghost.id,
        style: 'grid-column: ' + (0 <= gcol ? gcol + 2 : 2) + '; ' +
          rowsFor(this.ghost.t_start, this.ghost.t_end),
        text: 'moved from here',
      }))
    }

    grid.addEventListener('click', (ev) => {
      const cell = ev.target.closest && ev.target.closest('[data-session]')
      if (!cell) return
      this.focusIndex = Number(cell.getAttribute('data-index'))
      this.paintFocus()
      this.openDetail(this.sessions[this.focusIndex])
    })

    // DRAG POSTS THE SAME INTENT AS SHIFT-ARROWS. The drop target names a
    // room and a slot; the message carries those, and the server works out
    // what the move means. Nothing here computes a row.
    grid.addEventListener('dragstart', (ev) => {
      const cell = ev.target.closest && ev.target.closest('[data-session]')
      if (!cell) return
      ev.dataTransfer.effectAllowed = 'move'
      // Some browsers refuse to start a drag with no payload set.
      try { ev.dataTransfer.setData('text/plain', cell.getAttribute('data-session')) } catch (e) {}
      this.dragging = cell.getAttribute('data-session')
    })
    grid.addEventListener('dragover', (ev) => {
      if (null == this.dragging) return
      ev.preventDefault()
      ev.dataTransfer.dropEffect = 'move'
    })
    grid.addEventListener('drop', (ev) => {
      if (null == this.dragging) return
      ev.preventDefault()
      const id = this.dragging
      this.dragging = null

      // THE SLOT UNDER THE POINTER, not the event target. Cards are appended
      // after the slots, so a card covers the slot it sits in - and dropping
      // onto an OCCUPIED slot is not an edge case, it is how an organiser
      // deliberately creates a clash. closest() alone finds the card and the
      // drop is silently lost.
      const under = document.elementsFromPoint
        ? document.elementsFromPoint(ev.clientX, ev.clientY)
        : []
      const slot = under.find((n) => n.matches && n.matches('[data-slot]')) ||
        (ev.target.closest && ev.target.closest('[data-slot]'))
      if (!slot) return
      const session = (this.data.segments || []).find((x) => x.id === id)
      if (null == session) return

      this.moveSegment(session, slot.getAttribute('data-room'),
        Number(slot.getAttribute('data-start')))
    })

    const bar = el('div', { 'data-bar': '', hidden: '', class: 'vg-bar' }, [
      el('input', { type: 'text', placeholder: 'Command…', 'aria-label': 'Command bar' }),
      el('ul', {}, this.commands().map((c) =>
        el('li', {}, [el('kbd', { class: 'vg-kbd', text: c.key }), el('span', { text: c.label })]))),
    ])
    bar.querySelector('input').addEventListener('keydown', (ev) => {
      const hit = this.commands().find((c) => c.key === ev.key)
      if (hit) { ev.preventDefault(); bar.hidden = true; this.focus(); hit.run() }
      if ('Escape' === ev.key) { bar.hidden = true; this.focus() }
    })

    const help = el('div', { 'data-help': '', hidden: '', class: 'vg-help' }, [
      el('p', { text: 'j / k  move · Enter  open · S  sync plan · ?  this list · Cmd-K  commands' }),
    ])

    // The mockup's footer hint bar. Only keys that WORK are listed: a hint for
    // a binding that does nothing is worse than no hint at all. The Stage 2
    // keys (Shift-arrows, n, d, t, v, P, S) arrive with their bindings.
    const hint = (keys, label) => el('div', { class: 'ca-hint' }, [
      el('span', { class: 'vg-kbd', text: keys }),
      el('span', { text: label }),
    ])
    // ONLY KEYS THAT WORK. A hint for a binding that does nothing is worse
    // than no hint - `v` (validate panel) and `P` (publish) stay off until
    // they do something.
    const foot = el('div', { class: 'ca-foot' }, [
      hint('j k', 'move'),
      hint('Shift-arrows', 'move session'),
      hint('n', 'new'),
      hint('d', 'duplicate'),
      hint('t', 'status'),
      hint('v', 'validate'),
      hint('Enter', 'open'),
      hint('⌘K', 'commands'),
      hint('S', 'sync plan'),
      el('div', { class: 'vg-spacer' }),
      hint('?', 'all shortcuts'),
    ])

    this.replaceChildren(
      el('div', {
        class: 'vg-entity vg-agenda' + ('validate' === this.mode ? ' ca-dimmed' : ''),
      }, [
        this.renderHead(top, list),
        bar,
        help,
        el('div', { class: 'ca-scroll' }, [grid]),
        // Hidden until something is selected: an empty ruled box reads as a
        // component that failed to load.
        el('div', { 'data-detail': '', class: 'vg-detail-panel', hidden: '' }),
        foot,
        this.renderToast(),
        // The panel OVERLAYS the grid, dimmed behind it - a diagnostic about
        // a double-booking is not readable without the thing it is about.
        'validate' === this.mode
          ? renderValidatePanel(this.diagnostics, this.diagIndex)
          : null,
        el('div', { 'data-live': '', 'aria-live': 'polite', class: 'vg-sr' }),
      ]),
    )
    this.paintFocus()
  }
}

customElements.define('vg-view-cag-fixture', VgViewCagFixture)
