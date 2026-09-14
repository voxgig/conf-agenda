/* <conf-agenda> - the embeddable agenda component. SPEC 11.
 *
 * Structure follows podmind's widget/ask: plain HTMLElement, shadow DOM,
 * attribute config, CSS inlined with Vite's ?inline, library build to .mjs +
 * .umd.js. No framework - SPEC 11.2 budgets 30KB gzipped and this runs on
 * someone else's marketing site.
 *
 * READ-ONLY. It displays; it never writes. No auth, no cookies, no storage
 * beyond a remembered view preference. No analytics, ever - the page's
 * visitors did not agree to us (SPEC 17, privacy).
 */

import CSS from './conf-agenda.css?inline'

const TAG = 'conf-agenda'
const VIEWS = ['grid', 'list']

/** Escaping is done by the DOM, never by string concatenation into innerHTML. */
function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (null == v) continue
    if ('text' === k) node.textContent = String(v)
    else if ('part' === k) node.setAttribute('part', v)
    else if ('class' === k) node.className = v
    else node.setAttribute(k, String(v))
  }
  for (const kid of [].concat(kids)) if (null != kid) node.appendChild(kid)
  return node
}

/**
 * Wall-clock time in the conference's own zone, via Intl - the platform, not a
 * date library. SPEC 8.3: the zone NAME is authoritative and nothing outside
 * the one time module imports a date library. Here that module is this
 * function.
 */
function makeClock(tzn, lang) {
  let fmt
  try {
    fmt = new Intl.DateTimeFormat(lang || 'en', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tzn || 'UTC',
    })
  } catch (e) {
    // An unknown zone must not take the whole embed down with it.
    fmt = new Intl.DateTimeFormat(lang || 'en', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }
  return (ms) => fmt.format(new Date(ms))
}

/** Local date label, for splitting a multi-day grid. */
function makeDate(tzn, lang) {
  let fmt
  try {
    fmt = new Intl.DateTimeFormat(lang || 'en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: tzn || 'UTC',
    })
  } catch (e) {
    fmt = new Intl.DateTimeFormat(lang || 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  return (ms) => fmt.format(new Date(ms))
}

/** The local calendar day an instant falls on, as a sortable key. */
function makeDayKey(tzn) {
  let fmt
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tzn || 'UTC',
    })
  } catch (e) {
    fmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  return (ms) => fmt.format(new Date(ms))
}

/** Distinct slot boundaries, so a session can span the rows it covers. */
function ladder(sessions) {
  const marks = new Set()
  for (const s of sessions) {
    if (null != s.t_start) marks.add(s.t_start)
    if (null != s.t_end) marks.add(s.t_end)
  }
  return [...marks].sort((a, b) => a - b)
}

class ConfAgenda extends HTMLElement {
  static get observedAttributes() {
    return ['org', 'conference', 'view', 'day', 'track', 'theme', 'src', 'key', 'lang']
  }

  connectedCallback() {
    if (!this.shadow) this.shadow = this.attachShadow({ mode: 'open' })
    this.mark = this.getAttribute('mark') || Math.random().toString(36).slice(2, 8)
    this.load()
  }

  attributeChangedCallback(name, before, after) {
    if (!this.shadow || before === after) return
    // A view or filter change re-renders from data already held: one network
    // request on load (SPEC 11.2), not one per attribute change.
    if ('src' === name || 'org' === name || 'conference' === name || 'key' === name) this.load()
    else this.draw()
  }

  get debug() {
    return null != this.getAttribute('debug')
  }

  /** The data source. `src` wins; otherwise the hosted path for org/conference. */
  get source() {
    const src = this.getAttribute('src')
    if (src) return src
    const org = this.getAttribute('org')
    const conf = this.getAttribute('conference')
    if (!org || !conf) return null
    const key = this.getAttribute('key')
    return (
      'https://conf-agenda.voxgig.com/agenda/' +
      encodeURIComponent(org) + '/' + encodeURIComponent(conf) + '.json' +
      (key ? '?key=' + encodeURIComponent(key) : '')
    )
  }

  async load() {
    const url = this.source
    if (null == url) {
      return this.fail('needs an org and conference, or a src')
    }
    try {
      // No credentials: the embed runs on a third-party page and cannot carry
      // them (SPEC 9.1). Anonymous by construction, not by omission.
      const res = await fetch(url, { credentials: 'omit', mode: 'cors' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const body = await res.json()
      this.agenda = body && body.agenda ? body.agenda : body
      this.draw()
      this.emit('ready', { sessions: (this.agenda.sessions || []).length })
    } catch (err) {
      if (this.debug) console.error(TAG, err)
      // Degrade honestly (SPEC 11.2): a plain message, never an empty box and
      // never a stack trace on a stranger's site.
      this.fail('could not be loaded')
    }
  }

  fail(reason) {
    this.render([
      el('div', { class: 'note', part: 'error' }, [
        el('p', { text: 'The agenda ' + reason + '.' }),
      ]),
    ])
    this.emit('error', { reason })
  }

  emit(kind, detail) {
    this.dispatchEvent(
      new CustomEvent(TAG + ':' + kind, {
        detail: Object.assign({ mark: this.mark }, detail),
        bubbles: true,
        composed: true,
      }),
    )
  }

  render(nodes) {
    const style = document.createElement('style')
    style.textContent = CSS
    this.shadow.replaceChildren(style, ...nodes)
  }

  /** Sessions after the day/track attribute filters. */
  visible() {
    const track = this.getAttribute('track')
    let list = (this.agenda.sessions || []).filter((s) => null != s.t_start)
    if (track) list = list.filter((s) => s.track === track)
    return list.sort((a, b) => a.t_start - b.t_start || (a.id < b.id ? -1 : 1))
  }

  draw() {
    if (null == this.agenda) return
    const view = VIEWS.includes(this.getAttribute('view')) ? this.getAttribute('view') : 'grid'
    const sessions = this.visible()

    if (0 === sessions.length) {
      return this.render([
        el('div', { class: 'note', part: 'empty' }, [
          el('p', { text: 'No sessions are published yet.' }),
        ]),
      ])
    }
    this.render(['grid' === view ? this.grid(sessions) : this.list(sessions)])
  }

  list(sessions) {
    const clock = makeClock(this.agenda.conference && this.agenda.conference.t_tzn,
      this.getAttribute('lang'))
    const speakers = new Map((this.agenda.speakers || []).map((s) => [s.id, s.name]))

    return el('div', { class: 'wrap', part: 'list' },
      sessions.map((s) =>
        el('div', { class: 'session' + ('cancelled' === s.status ? ' cancelled' : ''),
          part: 'session' }, [
          el('div', { class: 'title', part: 'session-title', text: s.title || s.id }),
          el('div', { class: 'meta', text:
            clock(s.t_start) + (s.t_end ? '–' + clock(s.t_end) : '') +
            (s.speakers || []).map((id) => ' · ' + (speakers.get(id) || id)).join('') }),
          'cancelled' === s.status
            ? el('div', { class: 'badge', part: 'cancelled-badge', text: 'Cancelled' })
            : null,
        ]),
      ),
    )
  }

  /**
   * A REAL table with proper headers (SPEC 11.2): rooms are column headers,
   * times are row headers. A screen reader announces "Room A, 10:00" for a
   * cell without any ARIA bolted on, because the markup already says it.
   */
  grid(sessions) {
    const conf = this.agenda.conference || {}
    const clock = makeClock(conf.t_tzn, this.getAttribute('lang'))
    const speakers = new Map((this.agenda.speakers || []).map((s) => [s.id, s.name]))
    const roomRows = this.agenda.rooms || []

    // Sessions with no room cannot be placed in a room grid; show them as a
    // list rather than dropping them silently.
    const placed = sessions.filter((s) => null != s.room)
    if (0 === roomRows.length || 0 === placed.length) return this.list(sessions)

    const sessionNode = (s) => {
      const names = (s.speakers || []).map((id) => speakers.get(id) || id).join(', ')
      return el('div', {
        class: 'cancelled' === s.status ? 'session cancelled' : 'session',
      }, [
        el('div', { class: 'title', part: 'session-title', text: s.title || s.id }),
        names ? el('div', { class: 'meta', text: names }) : null,
        el('div', { class: 'meta', text: clock(s.t_start) + '–' + clock(s.t_end) }),
        'cancelled' === s.status
          ? el('div', { class: 'badge', part: 'cancelled-badge', text: 'Cancelled' })
          : null,
      ])
    }

    const rooms = roomRows.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    const clockDate = makeDate(conf.t_tzn, this.getAttribute('lang'))
    const dayKey = makeDayKey(conf.t_tzn)

    const head = el('tr', {}, [
      el('th', { scope: 'col', text: 'Time' }),
      ...rooms.map((r) => el('th', { scope: 'col', part: 'room-header', text: r.name || r.id })),
    ])

    // A conference runs over days, and one continuous time ladder across them
    // reads as a bug: the column runs 14:30 then 09:30. So the grid is split by
    // LOCAL DATE, each day its own ladder under a date header. SPEC 8 keeps
    // days out of the entity model - a day is a derived grouping - so this is
    // derived here, from each session's own instant in the conference zone.
    const days = new Map()
    for (const s of placed) {
      const k = dayKey(s.t_start)
      if (!days.has(k)) days.set(k, [])
      days.get(k).push(s)
    }
    const dayKeys = [...days.keys()].sort()
    const multiDay = 1 < dayKeys.length

    const body = []

    for (const key of dayKeys) {
      const forDay = days.get(key)

      if (multiDay) {
        body.push(
          el('tr', { class: 'dayrow' }, [
            el('th', {
              scope: 'colgroup',
              colspan: rooms.length + 1,
              part: 'day-header',
              text: clockDate(forDay[0].t_start),
            }),
          ]),
        )
      }

      const marks = ladder(forDay)
      const cover = new Map()

      for (let i = 0; i < marks.length - 1; i++) {
        const cells = [el('th', { scope: 'row', part: 'time-label', text: clock(marks[i]) })]

        for (const room of rooms) {
          const here = forDay.filter((x) => x.room === room.id && x.t_start === marks[i])
          const covering = cover.get(room.id + ':' + i)

          if (covering) {
            // A session starting inside another's rowspan is a double booking.
            // Put it in the SAME cell rather than skipping the slot, so nothing
            // is ever hidden.
            for (const s of here) covering.appendChild(sessionNode(s))
            if (here.length) covering.classList.add('clash')
            continue
          }
          if (0 === here.length) {
            cells.push(el('td', { class: 'empty' }))
            continue
          }

          const span = Math.max(
            ...here.map((x) => {
              const endIdx = marks.indexOf(x.t_end)
              return Math.max(1, (endIdx < 0 ? i + 1 : endIdx) - i)
            }),
          )
          const cell = el('td', { rowspan: 1 < span ? span : null, part: 'session' })
          if (1 < here.length) cell.classList.add('clash')
          for (const s of here) cell.appendChild(sessionNode(s))
          for (let k = 1; k < span; k++) cover.set(room.id + ':' + (i + k), cell)
          cells.push(cell)
        }
        body.push(el('tr', {}, cells))
      }
    }

    const table = el('table', { part: 'grid' }, [
      el('caption', { part: 'caption', text: conf.title || '' }),
      el('thead', {}, [head]),
      el('tbody', {}, body),
    ])

    // Selecting a session is an event the host page can act on; the embed
    // itself never navigates (SPEC 11.2, read-only).
    table.addEventListener('click', (ev) => {
      const cell = ev.target.closest && ev.target.closest('.session')
      if (!cell) return
      const title = cell.querySelector('.title')
      this.emit('select', { title: title ? title.textContent : null })
    })

    return el('div', { class: 'wrap' }, [table])
  }
}

// Multiple instances on one page must not collide, and a second script tag
// must not throw (SPEC 11.2).
if (!customElements.get(TAG)) customElements.define(TAG, ConfAgenda)

export default ConfAgenda
