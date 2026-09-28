// THE PUBLISH CONFIRMATION (SPEC §13.1, mockups/src/PublishConfirm.dc.html).
//
// §13.1: "`P` Publish (confirms; states what changed since the last publish)".
// Both halves matter. A confirmation that only asks "are you sure?" is a modal
// in a common path, which K5 forbids; one that states the changes is the
// organiser reading their own work back before it goes public.
//
// IT OVERLAYS THE GRID, dimmed, like the validation panel, and for the same
// reason: the thing being confirmed is behind it.
//
// THIS IS WHERE THE CONFIRMATION LIVES, not in the message. `apply:sync`
// carries a required `confirm` param because applying reaches real speakers
// and C4 wants the server to refuse without it. Publishing is the organiser's
// own data going public, it gates on validate:fixture, and `unpublish:fixture`
// exists (SPEC §9), so a screen is the right weight. The difference is that a
// screen can be skipped by a caller and a message param cannot, which is
// exactly the distinction between the two actions.

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

/** "2h ago", "3 days ago". Enough precision for a publish timestamp. */
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
 * The state line under the title: whether it can go, and when it last did.
 *
 * Errors first, because that is the one that changes what the button does.
 */
function stateLine(plan) {
  const when = null == plan.published_at
    ? 'never published'
    : 'last published ' + ago(plan.published_at)

  return (plan.valid
    ? 'Validation clean'
    : plan.error_count + (1 === plan.error_count ? ' error' : ' errors') +
      ' · publishing is blocked') + ' · ' + when
}

/**
 * The confirmation, as a node for the grid to append.
 *
 * `onPublish` runs on Enter or the button; `onCancel` on Esc or Cancel. The
 * keys are handled by the grid's binding registry, not here, so the overlay
 * and the `?` list cannot disagree about them.
 */
export function renderPublishConfirm(plan, onPublish, onCancel) {
  const changes = plan.changes || []
  const blocked = true !== plan.valid

  const head = el('div', { class: 'ca-pub-head' }, [
    el('h2', { class: 'ca-pub-title', text: 'Publish ' + (plan.title || '') + '?' }),
    el('div', {
      class: 'ca-pub-state' + (blocked ? ' ca-pub-state--blocked' : ''),
      text: stateLine(plan),
    }),
  ])

  // NOTHING TO SAY IS ALSO AN ANSWER. Republishing an unchanged conference is
  // legitimate (a snapshot rebuild), and saying "no changes" is more use than
  // an empty box that reads as a component that failed to load.
  const body = el('div', { class: 'ca-pub-changes' },
    changes.length
      ? [
        el('div', { class: 'ca-pub-label', text: 'SINCE LAST PUBLISH' }),
        ...changes.map((c) => el('div', { class: 'ca-pub-change', 'data-verb': c.verb }, [
          el('span', { class: 'ca-pub-verb', text: c.verb }),
          el('span', { class: 'ca-pub-what', text: (c.title || '') + ' → ' + c.detail }),
        ])),
      ]
      : [el('div', { class: 'ca-pub-label', text: 'NO CHANGES SINCE LAST PUBLISH' })])

  // What publishing actually touches, named rather than implied. And that
  // speaker calendars are NOT among them: publishing and syncing are separate
  // acts, and an organiser who assumes otherwise has not told their speakers.
  const note = el('div', { class: 'ca-pub-note' }, [
    el('span', { text: 'Updates the public page, the embed, ' }),
    el('code', { text: 'agenda.json' }),
    el('span', { text: ' and the .ics/.csv feeds. Speaker calendars are synced separately: press ' }),
    el('span', { class: 'vg-kbd', text: 'S' }),
    el('span', { text: ' after publishing.' }),
  ])

  const cancel = el('button', { type: 'button', class: 'ca-pub-cancel' }, [
    el('span', { text: 'Cancel ' }),
    el('span', { class: 'vg-kbd', text: 'Esc' }),
  ])
  cancel.addEventListener('click', () => onCancel())

  // THE BUTTON STATES THE COUNT, the same argument the sync plan's Apply
  // button makes: the organiser is agreeing to a specific amount of change,
  // not to the word "publish".
  const go = el('button', {
    type: 'button',
    class: 'ca-pub-go',
    'data-publish': '',
    ...(blocked ? { disabled: 'disabled' } : {}),
    title: blocked ? 'Fix the errors first: press v to see them' : '',
  }, [
    el('span', {
      text: blocked
        ? 'Fix ' + plan.error_count + (1 === plan.error_count ? ' error' : ' errors') + ' first'
        : changes.length
          ? 'Publish ' + changes.length + (1 === changes.length ? ' change' : ' changes')
          : 'Publish anyway',
    }),
    blocked ? el('span', { class: 'vg-kbd', text: 'v' }) : el('span', { class: 'vg-kbd', text: 'Enter' }),
  ])
  if (!blocked) go.addEventListener('click', () => onPublish())

  return el('div', {
    class: 'ca-pub-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Publish confirmation',
    'data-publish-confirm': '',
  }, [head, body, note, el('div', { class: 'ca-pub-foot' }, [cancel, go])])
}
