// THE AGENDA GRID (SPEC 13) - the screen that carries this product.
//
// Stage 1 depth: READ-ONLY. Rooms as columns, time as rows, keyboard focus,
// and a command bar. Editing, drag-to-move, optimistic updates and undo are
// Stage 2, and they arrive as named intent messages (move:segment,
// set:status, ...) - never as an entity save composed in the browser (SPEC 9).
//
// Plain custom element, not Lit: SPEC 19.2 says build S1's grid this way and
// migrate when @voxgig/build carries Lit, because S1's grid is small by
// design. The DOM-building here is the part Lit will replace.
//
// Data comes from aim:web,on:cag,load:tree - NOT the published snapshot. The
// organiser must see drafts, which agenda.json deliberately never contains.

import { bus } from '../../bus.js'

const STATUS_LABEL = { draft: 'Draft', confirmed: '', cancelled: 'Cancelled' }

function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (null == v) continue
    if ('text' === k) node.textContent = String(v)
    else if ('class' === k) node.className = v
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

class VgViewCagFixture extends HTMLElement {
  constructor() {
    super()
    this.focusIndex = 0
    this.onKey = this.onKey.bind(this)
  }

  connectedCallback() {
    this.tabIndex = 0
    this.addEventListener('keydown', this.onKey)
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.onKey)
  }

  navigate(canon, id) {
    if (this.onNavigate) this.onNavigate(canon, id)
  }

  async reload() {
    const r = await bus.post({ aim: 'web', on: 'cag', load: 'tree' })
    if (!r || !r.ok) {
      this.replaceChildren(
        el('div', { class: 'vg-entity' }, [
          el('p', { class: 'vg-muted', text: 'The agenda could not be loaded.' }),
        ]),
      )
      return
    }
    this.data = r
    this.render()
  }

  /** Sessions in grid order - the order j/k walks. */
  get sessions() {
    const segs = (this.data.segments || []).filter(
      (s) => 'day' !== s.kind && null != s.t_start,
    )
    return segs.sort((a, b) => a.t_start - b.t_start || (a.id < b.id ? -1 : 1))
  }

  onKey(ev) {
    const list = this.sessions
    if (0 === list.length) return

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

  paintFocus() {
    const cells = [...this.querySelectorAll('[data-session]')]
    cells.forEach((c, i) => {
      const on = i === this.focusIndex
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
    const speakers = new Map((this.data.speakers || []).map((s) => [s.id, s.name]))
    const names = (this.data.appearances || [])
      .filter((a) => a.fixture_id === session.id)
      .map((a) => speakers.get(a.speaker_id) || a.speaker_id)
    const clock = clockFor(this.data.top && this.data.top.t_tzn)

    // replaceChildren stringifies anything that is not a Node, so a null
    // child renders the literal text "null". Filter before it, not inside el().
    panel.replaceChildren(...[
      el('h3', { text: session.title || session.id }),
      el('p', { class: 'vg-muted', text:
        clock(session.t_start) + '–' + clock(session.t_end) +
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
    const appearances = this.data.appearances || []
    const rooms = (this.data.rooms || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    const list = this.sessions

    const marks = [...new Set(list.flatMap((s) => [s.t_start, s.t_end]))].sort((a, b) => a - b)
    const placed = list.filter((s) => null != s.room_id)
    const order = new Map(list.map((s, i) => [s.id, i]))

    const sessionNode = (s) => {
      const names = appearances
        .filter((a) => a.fixture_id === s.id)
        .map((a) => speakers.get(a.speaker_id) || a.speaker_id)
      const badge = STATUS_LABEL[s.effective_status] || ''
      return el('div', {
        'data-session': s.id,
        'data-index': order.get(s.id),
        class: 'cancelled' === s.effective_status ? 'vg-session vg-cancelled' : 'vg-session',
      }, [
        el('div', { class: 'vg-strong', text: s.title || s.id }),
        names.length ? el('div', { class: 'vg-muted', text: names.join(', ') }) : null,
        el('div', { class: 'vg-muted', text: clock(s.t_start) + '–' + clock(s.t_end) }),
        // Status is shown as a WORD, never as colour alone (K10).
        badge ? el('div', { class: 'vg-badge', text: badge }) : null,
      ])
    }

    const head = el('tr', {}, [
      el('th', { scope: 'col', text: 'Time' }),
      ...rooms.map((r) => el('th', { scope: 'col', text: r.name || r.id })),
    ])

    // A session can START INSIDE another session's rowspan - that is exactly
    // what a room double-booking looks like. So instead of skipping a covered
    // slot (which silently HID the second session), remember which cell covers
    // each slot and append into it. Nothing is ever dropped.
    const cover = new Map()
    const body = []

    for (let i = 0; i < marks.length - 1; i++) {
      const cells = [el('th', { scope: 'row', class: 'vg-muted', text: clock(marks[i]) })]

      for (const room of rooms) {
        const here = placed.filter((x) => x.room_id === room.id && x.t_start === marks[i])
        const covering = cover.get(room.id + ':' + i)

        if (covering) {
          // Covered by a span from above. Any session starting now is a clash:
          // put it in the SAME cell so the organiser sees both.
          for (const s of here) {
            covering.appendChild(sessionNode(s))
            covering.classList.add('vg-clash')
          }
          continue
        }

        if (0 === here.length) {
          cells.push(el('td', {}))
          continue
        }

        const spans = here.map((x) => {
          const endIdx = marks.indexOf(x.t_end)
          return Math.max(1, (endIdx < 0 ? i + 1 : endIdx) - i)
        })
        const span = Math.max(...spans)

        const cell = el('td', { rowspan: 1 < span ? span : null })
        if (1 < here.length) cell.classList.add('vg-clash')
        for (const s of here) cell.appendChild(sessionNode(s))
        for (let k = 1; k < span; k++) cover.set(room.id + ':' + (i + k), cell)
        cells.push(cell)
      }
      body.push(el('tr', {}, cells))
    }

    const bar = el('div', { 'data-bar': '', hidden: '', class: 'vg-bar' }, [
      el('input', { type: 'text', placeholder: 'Command…', 'aria-label': 'Command bar' }),
      el('ul', {}, this.commands().map((c) =>
        el('li', {}, [el('kbd', { text: c.key }), el('span', { text: ' ' + c.label })]))),
    ])
    bar.querySelector('input').addEventListener('keydown', (ev) => {
      const hit = this.commands().find((c) => c.key === ev.key)
      if (hit) { ev.preventDefault(); bar.hidden = true; this.focus(); hit.run() }
      if ('Escape' === ev.key) { bar.hidden = true; this.focus() }
    })

    const help = el('div', { 'data-help': '', hidden: '', class: 'vg-help' }, [
      el('p', { text: 'j / k  move · Enter  open · ?  this list · Cmd-K  commands' }),
    ])

    const table = el('table', { class: 'vg-grid' }, [
      el('caption', { text: (top.title || top.id) + ' · ' + (top.effective_status || '') }),
      el('thead', {}, [head]),
      el('tbody', {}, body),
    ])
    table.addEventListener('click', (ev) => {
      const cell = ev.target.closest && ev.target.closest('[data-session]')
      if (!cell) return
      this.focusIndex = Number(cell.getAttribute('data-index'))
      this.paintFocus()
      this.openDetail(this.sessions[this.focusIndex])
    })

    this.replaceChildren(
      el('div', { class: 'vg-entity' }, [
        el('div', { class: 'vg-entity-head' }, [
          el('h2', { text: 'Agenda' }),
          el('span', { class: 'vg-muted', text: list.length + ' sessions · read-only' }),
        ]),
        bar,
        help,
        el('div', { class: 'vg-scroll' }, [table]),
        el('div', { 'data-detail': '', class: 'vg-detail' }),
        el('div', { 'data-live': '', 'aria-live': 'polite', class: 'vg-sr' }),
      ]),
    )
    this.paintFocus()
  }
}

customElements.define('vg-view-cag-fixture', VgViewCagFixture)
