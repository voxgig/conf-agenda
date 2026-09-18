// THE SYNC PLAN (SPEC 10.3, mockups/src/SyncPlan.dc.html).
//
// The screen exists to make the safety machinery VISIBLE. Everything the
// ledger does is invisible by construction - its whole job is to not send
// things - so without this screen an organiser has to take "we never send a
// duplicate" on faith. The no-op summary row is the point of the page:
//
//     13 further segments · hash unchanged · no-op · zero provider calls
//
// That line is C2 shown rather than claimed.
//
// READ-ONLY. plan:sync sends nothing and writes nothing (C4's dry run), and
// there is no apply:sync on the browser surface at all - applying reaches real
// speakers. The Apply control says what it would do and is plainly disabled,
// because a button that looks live and does nothing is worse than one that
// explains itself.

const ACTION = {
  create: { label: 'create', cls: 'ca-act--create' },
  update: { label: 'update · same UID, seq+1', cls: 'ca-act--update' },
  cancel: { label: 'cancel event · tombstone', cls: 'ca-act--cancel' },
  noop: { label: 'no-op · zero provider calls', cls: 'ca-act--noop' },
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

/** What changed, in the organiser's words rather than the ledger's. */
function whatChanged(item) {
  if ('create' === item.action) {
    return 'resurrected' === item.why ? 'resurrected — same UID' : 'new segment'
  }
  if ('cancel' === item.action) {
    // Naming the ordering here is deliberate: it is the single least obvious
    // thing the reconciliation does, and the one most likely to be "optimised"
    // away by someone who has not read why.
    return 'segment-deleted' === item.why
      ? 'deleted — found by top_id'
      : 'cancelled — checked before hash'
  }
  const changed = item.changed || []
  return changed.length ? changed.join(' + ') : 'updated'
}

function recipientText(item) {
  const names = item.recipients || []
  if (0 === names.length) return '—'
  if (3 >= names.length) return names.join(', ')
  return names.length + ' speakers'
}

function row(item) {
  const act = ACTION[item.action] || ACTION.noop
  const cls = 'cancel' === item.action ? 'ca-sync-row ca-sync-row--cancel' : 'ca-sync-row'
  return el('div', { class: cls, role: 'row' }, [
    el('div', { class: 'ca-sync-seg', role: 'cell', text: item.title || item.fixture_id }),
    el('div', { class: 'ca-sync-meta', role: 'cell', text: whatChanged(item) }),
    el('div', { class: 'ca-sync-meta', role: 'cell', text: recipientText(item) }),
    el('div', { role: 'cell' }, [
      el('span', { class: 'ca-act ' + act.cls, text: act.label }),
    ]),
  ])
}

/**
 * Render the plan into `host`. `onBack` returns to the grid.
 * Returns nothing; the host is replaced wholesale.
 */
export function renderSyncPlan(host, plan, onBack, onApply) {
  const sending = (plan.items || []).filter((i) => 'noop' !== i.action)
  const accounts = plan.accounts || []

  const head = el('div', { class: 'ca-sync-head' }, [
    el('h2', { class: 'ca-sync-title', text: (plan.title || plan.top_id) + ' · Calendar sync' }),
    // The loudest thing on the page, and it should be: this screen is one
    // keystroke away from one that does send.
    el('span', { class: 'ca-plan-badge', text: 'PLAN — NOTHING SENT' }),
    el('div', { class: 'vg-spacer' }),
    el('span', { class: 'vg-kbd', text: 'Esc' }),
  ])

  const accountRow = el('div', { class: 'ca-accounts' }, [
    el('span', { class: 'ca-accounts-label', text: 'Connected accounts' }),
    ...(accounts.length
      ? accounts.map((a) => el('span', { class: 'ca-account' }, [
        el('span', { text: a.provider + ' · ' + a.name }),
        el('span', {
          class: 'active' === a.status ? 'ca-dot ca-dot--ok' : 'ca-dot',
          'aria-hidden': 'true', text: '●',
        }),
        // Never colour alone (K10): the state is a word in the label too.
        el('span', { class: 'vg-sr', text: a.status }),
      ]))
      : [el('span', { class: 'vg-muted', text: 'none connected' })]),
  ])

  const rows = sending.map(row)

  // ONE line for everything that needs nothing. The count is the whole
  // argument for the ledger existing.
  if (0 < (plan.unchanged || 0)) {
    rows.push(el('div', { class: 'ca-sync-row ca-sync-row--quiet', role: 'row' }, [
      el('div', { class: 'ca-sync-meta', role: 'cell', 'data-unchanged': '',
        text: plan.unchanged + (1 === plan.unchanged ? ' further segment' : ' further segments') }),
      el('div', { class: 'ca-sync-meta', role: 'cell', text: 'hash unchanged' }),
      el('div', { class: 'ca-sync-meta', role: 'cell', text: '—' }),
      el('div', { role: 'cell' }, [
        el('span', { class: 'ca-act ca-act--noop', text: ACTION.noop.label }),
      ]),
    ]))
  }

  const table = el('div', { class: 'ca-sync-table', role: 'table' }, [
    el('div', { class: 'ca-sync-row ca-sync-row--head', role: 'row' }, [
      el('div', { role: 'columnheader', text: 'Segment' }),
      el('div', { role: 'columnheader', text: 'What changed' }),
      el('div', { role: 'columnheader', text: 'Recipients' }),
      el('div', { role: 'columnheader', text: 'Action' }),
    ]),
    ...(rows.length ? rows : [el('div', { class: 'ca-sync-row ca-sync-row--quiet' }, [
      el('div', { class: 'ca-sync-meta', text: 'Nothing to send. Every segment is up to date.' }),
    ])]),
  ])

  const people = plan.recipients || 0
  const summary = el('p', { class: 'ca-sync-summary' }, [
    el('span', { text: 'Applying sends ' }),
    el('strong', { text: sending.length + (1 === sending.length ? ' calendar change' : ' calendar changes') }),
    el('span', { text: ' to ' }),
    el('strong', { text: people + (1 === people ? ' speaker' : ' speakers') }),
    el('span', { text: ' across ' + accounts.length
      + (1 === accounts.length ? ' account' : ' accounts') + '. ' }),
    // The three rules, stated where the decision is made rather than in a doc
    // nobody opens at 22:00 the night before.
    el('span', { class: 'vg-muted', text:
      'Outbound cap ' + (plan.cap || 100) + ' per run · one sync at a time per conference'
      + ' · a change is always an update, never a duplicate.' }),
  ])

  const back = el('button', { type: 'button', class: 'vg-btn vg-btn--ghost', 'data-back': '' }, [
    el('span', { text: 'Back' }),
    el('span', { class: 'vg-kbd', text: 'Esc' }),
  ])
  back.addEventListener('click', onBack)

  // THE CONFIRMATION IS THIS BUTTON. It states the counts rather than asking
  // "are you sure?", which is what C4 means by explicit: the organiser is
  // agreeing to a specific number of messages to a specific number of people.
  //
  // Disabled when there is nothing to send - an Apply that would do nothing
  // still acquires a lock and writes a run.
  const apply = el('button', {
    type: 'button', class: 'vg-btn vg-btn--teal', 'data-apply': '',
    disabled: 0 === sending.length ? '' : null,
    title: 0 === sending.length
      ? 'Nothing to send: every segment is up to date.'
      : 'Sends ' + sending.length + ' change(s) to ' + people + ' speaker(s).',
    text: 'Apply \u2014 send ' + sending.length,
  })
  if (onApply) apply.addEventListener('click', onApply)

  host.replaceChildren(
    el('div', { class: 'vg-entity vg-entity--wide vg-agenda' }, [
      head,
      accountRow,
      table,
      el('div', { class: 'ca-sync-foot' }, [
        summary,
        el('div', { class: 'vg-spacer' }),
        el('span', { class: 'ca-apply-note', 'data-apply-note': '' }),
        back,
        apply,
      ]),
    ]),
  )
  back.focus()
}
