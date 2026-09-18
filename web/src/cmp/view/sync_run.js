// THE SYNC RUN (SPEC 10.6, mockups/src/SyncRun.dc.html).
//
// "Progress is observable: the organiser sees a run with per-segment state,
// not a spinner." A spinner says "wait"; this says which segment, to which
// calendar, how long it took, and — when a provider says no — what it said and
// when the next attempt is.
//
// The failure states are the point. A sync that works needs no screen; a sync
// where one of forty invitations was refused needs exactly this one, because
// otherwise "sent" quietly means "we tried".

const STATE = {
  sent: { label: 'SENT ✓', cls: 'ca-run-st--sent' },
  noop: { label: 'NO-OP', cls: 'ca-run-st--noop' },
  pending: { label: 'SENDING…', cls: 'ca-run-st--sending' },
  abandoned: { label: 'FAILED', cls: 'ca-run-st--failed' },
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

function secs(ms) {
  if (!ms) return ''
  return (ms / 1000).toFixed(1) + 's'
}

/** A pending job that has already failed once is RETRYING, not sending. */
function stateOf(job) {
  if ('pending' === job.state && 0 < (job.attempts || 0)) {
    return { label: 'RETRYING', cls: 'ca-run-st--retry' }
  }
  return STATE[job.state] || STATE.pending
}

/** The mono detail line: what this job is doing, in the ledger's own terms. */
function detail(job) {
  const who = job.provider ? job.provider + '/' + job.account : job.account
  if ('cancel' === job.action) return 'cancel · link tombstoned'
  if ('update' === job.action) {
    return 'update · same UID, seq ' + (job.sequence != null ? job.sequence : '?')
  }
  const n = job.recipients || 0
  return 'create · ' + who + (n ? ' · ' + n + (1 === n ? ' invitation' : ' invitations') : '')
}

function row(job, now) {
  const st = stateOf(job)
  const failing = '' !== (job.last_error || '')
  const cls = ['ca-run-row']
  if ('cancel' === job.action) cls.push('ca-run-row--cancel')
  if (failing && 'pending' === job.state) cls.push('ca-run-row--retry')
  else if ('abandoned' === job.state) cls.push('ca-run-row--failed')
  else if ('pending' === job.state) cls.push('ca-run-row--active')

  // A retry says the provider's OWN words and when it will try again. "Failed"
  // with no reason is what sends an organiser to a support channel.
  const line = failing
    ? job.last_error + (0 < (job.next_at || 0) && job.next_at > now
      ? ' — attempt ' + ((job.attempts || 0) + 1)
        + ' in ' + Math.max(1, Math.round((job.next_at - now) / 1000)) + 's, backoff'
      : '')
    : detail(job)

  return el('div', { class: cls.join(' '), role: 'row' }, [
    el('div', { class: 'ca-run-st ' + st.cls, role: 'cell', text: st.label }),
    el('div', { class: 'ca-run-seg', role: 'cell', text: job.title || job.fixture_id }),
    el('div', {
      class: failing ? 'ca-run-detail ca-run-detail--bad' : 'ca-run-detail',
      role: 'cell', text: line,
    }),
    el('div', { class: 'ca-run-ms', role: 'cell', text: secs(job.ms) }),
  ])
}

/**
 * Render one run into `host`. `onBack` returns to the grid.
 * Returns true while the run is still going, so the caller knows to poll.
 */
export function renderSyncRun(host, data, onBack) {
  const run = data.run || {}
  const jobs = data.jobs || []
  const now = Date.now()

  const settled = jobs.filter((j) => 'pending' !== j.state).length
  const running = 'running' === run.state

  const head = el('div', { class: 'ca-sync-head' }, [
    el('h2', { class: 'ca-sync-title', text:
      (data.title || run.top_id) + ' · Calendar sync — '
      + (running ? 'applying' : run.state) }),
    el('div', { class: 'vg-spacer' }),
    // Stated on screen because it is the reason a second Apply is refused,
    // and an unexplained refusal reads as a bug.
    el('span', { class: 'ca-run-lock', text: running
      ? 'lock held — one sync per conference'
      : 'lock released' }),
  ])

  const pct = jobs.length ? Math.round(100 * settled / jobs.length) : 100
  const progress = el('div', { class: 'ca-run-progress' }, [
    el('div', {
      class: 'ca-run-bar', role: 'progressbar',
      'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-label': 'Sync progress',
    }, [el('div', { class: 'ca-run-bar-fill', style: 'width: ' + pct + '%;' })]),
    el('span', { class: 'ca-run-count', 'data-progress': '', text:
      settled + ' of ' + jobs.length
      + (data.noops ? ' · ' + data.noops + ' no-ops skipped' : '') }),
  ])

  const table = el('div', { class: 'ca-run-table', role: 'table' },
    jobs.length
      ? jobs.map((j) => row(j, now))
      : [el('div', { class: 'ca-run-row' }, [
        el('div', { class: 'ca-run-detail', text:
          'Nothing to send — every segment was already up to date.' }),
      ])])

  const back = el('button', { type: 'button', class: 'vg-btn vg-btn--ghost', 'data-back': '' }, [
    el('span', { text: 'Back' }),
    el('span', { class: 'vg-kbd', text: 'Esc' }),
  ])
  back.addEventListener('click', onBack)

  host.replaceChildren(
    el('div', { class: 'vg-entity vg-entity--wide vg-agenda' }, [
      head,
      progress,
      table,
      el('div', { class: 'ca-sync-foot' }, [
        el('p', { class: 'ca-sync-summary', text:
          'Failures are recorded, shown here and retried with backoff — '
          + '“sent” means the provider accepted it.' }),
        el('div', { class: 'vg-spacer' }),
        back,
      ]),
      el('div', { 'aria-live': 'polite', class: 'vg-sr', text:
        settled + ' of ' + jobs.length + ' settled' }),
    ]),
  )

  // Focus the one control on the page, but ONLY when focus has left the host -
  // this re-renders every second while the run is live, and stealing focus on
  // every poll would make Escape and Tab unusable.
  if (!host.contains(document.activeElement)) back.focus()

  return running
}
