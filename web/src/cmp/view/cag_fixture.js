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

import { bus } from '../../bus.js'
import { renderSyncPlan } from './sync_plan.js'
import { renderSyncRun } from './sync_run.js'

const STATUS_LABEL = { draft: 'Draft', confirmed: '', cancelled: 'Cancelled' }

// Kinds that read as an interval in the programme rather than a session with a
// speaker. The mockup draws these as a dashed band.
const BREAK_KINDS = new Set(['brk', 'mea'])

const HALF_HOUR = 30 * 60 * 1000

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
    // 'grid' | 'sync'. The sync plan is one keystroke away rather than a nav
    // item, because it is a thing you do TO a conference, not a place.
    this.mode = 'grid'
    this.onKey = this.onKey.bind(this)
  }

  connectedCallback() {
    this.tabIndex = 0
    this.addEventListener('keydown', this.onKey)
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.onKey)
    this.stopPolling()
  }

  navigate(canon, id) {
    if (this.onNavigate) this.onNavigate(canon, id)
  }

  async reload() {
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
    // Days are a grouping, not an entity (SPEC 8.1) - a day is an ordinary
    // intermediate fixture, so a conference may have none.
    const days = this.days
    if (!days.some((d) => d.id === this.dayId)) this.dayId = days.length ? days[0].id : null
    this.focusIndex = 0
    this.render()
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
    if ('grid' !== this.mode) {
      if ('Escape' === ev.key) { ev.preventDefault(); this.showGrid() }
      return
    }

    const list = this.sessions
    if (0 === list.length) return

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
      el('p', { class: 'vg-muted', text: 'Read-only at this stage. Editing arrives in Stage 2.' }),
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

  /** Conference picker, day pills and publish state - the mockup's header. */
  renderHead(top, list) {
    const tops = this.data.tops || []
    const kids = []

    if (1 < tops.length) {
      const sel = el('select', { class: 'ca-confsel', 'aria-label': 'Conference' },
        tops.map((t) => el('option', { value: t.id, text: t.title || t.id })))
      sel.value = top.id
      sel.addEventListener('change', () => {
        this.fixtureId = sel.value
        this.dayId = null
        this.reload()
      })
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
    state.appendChild(el('span', { text: ' · ' + list.length + ' sessions · read-only' }))
    kids.push(state)

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
    const marks = [...new Set(list.flatMap((s) => [s.t_start, s.t_end]))].sort((a, b) => a - b)
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
        class: cls.join(' '),
        role: 'listitem',
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

    grid.addEventListener('click', (ev) => {
      const cell = ev.target.closest && ev.target.closest('[data-session]')
      if (!cell) return
      this.focusIndex = Number(cell.getAttribute('data-index'))
      this.paintFocus()
      this.openDetail(this.sessions[this.focusIndex])
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
    const foot = el('div', { class: 'ca-foot' }, [
      hint('j k', 'move'),
      hint('Enter', 'open'),
      hint('⌘K', 'commands'),
      hint('S', 'sync plan'),
      el('div', { class: 'vg-spacer' }),
      hint('?', 'all shortcuts'),
    ])

    this.replaceChildren(
      el('div', { class: 'vg-entity vg-agenda' }, [
        this.renderHead(top, list),
        bar,
        help,
        el('div', { class: 'ca-scroll' }, [grid]),
        // Hidden until something is selected: an empty ruled box reads as a
        // component that failed to load.
        el('div', { 'data-detail': '', class: 'vg-detail-panel', hidden: '' }),
        foot,
        el('div', { 'data-live': '', 'aria-live': 'polite', class: 'vg-sr' }),
      ]),
    )
    this.paintFocus()
  }
}

customElements.define('vg-view-cag-fixture', VgViewCagFixture)
