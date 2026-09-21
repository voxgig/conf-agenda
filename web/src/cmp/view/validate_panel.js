// THE VALIDATION PANEL (SPEC 16.3, mockups/src/Validate.dc.html).
//
// The header already carries the COUNT - "2 errors — room-double-booked +1" -
// and a count is enough to know you have a problem and not enough to fix it.
// This is the list: which rule, which two sessions, and a key that takes you
// to one of them.
//
// IT OVERLAYS THE GRID rather than replacing it, which is why this module
// returns a node instead of mounting one the way sync_plan.js does. The
// mockup dims the grid behind the panel on purpose: a diagnostic about a
// double-booking is not readable without the thing it is about, and `Enter`
// jumps into a grid that is still there.
//
// The diagnostic structure is the backend's (src/lib/validate/diagnostic.ts):
// a stable `rule` id, a severity, a one-line message, the anchor `entity`,
// every `related` entity so a clash names BOTH sides, and a human `fix`. One
// structure renders in the app, the CLI and the API - so nothing here parses
// prose, and nothing here re-derives a rule.

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

/**
 * One diagnostic.
 *
 * `Enter` is offered on the FOCUSED one only. Repeating the hint on every row
 * turns it into decoration - the mockup shows it once, under the row the ring
 * is on, which is also where somebody about to press it is looking.
 */
function diagNode(d, focused, index) {
  const isError = 'error' === d.severity
  return el('div', {
    class: 'ca-diag' + (focused ? ' ca-diag--on' : ''),
    'data-diag': String(index),
    'data-rule': d.rule,
    role: 'listitem',
    // The anchor, so Enter knows where to go without the panel keeping a
    // second index of its own.
    'data-entity': d.entity ? d.entity.id : '',
  }, [
    el('div', { class: 'ca-diag-head' }, [
      el('span', {
        class: 'ca-sev ' + (isError ? 'ca-sev--error' : 'ca-sev--warn'),
        text: isError ? 'ERROR' : 'WARN',
      }),
      // THE STABLE RULE ID, never a localised label. It is what a CLI prints,
      // what an API returns and what somebody pastes into a search.
      el('span', { class: 'ca-diag-code', text: d.rule }),
    ]),
    el('div', { class: 'ca-diag-what', text: d.message }),
    // The fix is the part that makes a diagnostic actionable, and it is
    // already written on the server - the panel must not paraphrase it.
    d.fix ? el('div', { class: 'ca-diag-fix', text: d.fix }) : null,
    focused
      ? el('div', { class: 'ca-diag-jump' }, [
        el('span', { class: 'vg-kbd', text: 'Enter' }),
        el('span', { text: ' jump to session' }),
      ])
      : null,
  ])
}

/**
 * The panel, as a node for the grid to append.
 *
 * `diagnostics` is already sorted by the server - errors before warnings,
 * then rule, then entity (SPEC 16.3, and SPEC 17: identical input, identical
 * output). Re-sorting here would be a second ordering to keep in step.
 */
export function renderValidatePanel(diagnostics, index) {
  const list = diagnostics || []
  const errors = list.filter((d) => 'error' === d.severity).length
  const warnings = list.length - errors

  const head = el('div', { class: 'ca-val-head' }, [
    el('h2', { class: 'ca-val-title', text: 'Validation' }),
    el('span', { class: 'ca-val-count ca-val-count--error',
      text: errors + (1 === errors ? ' error' : ' errors') }),
    el('span', { class: 'ca-val-count ca-val-count--warn',
      text: warnings + (1 === warnings ? ' warning' : ' warnings') }),
    el('div', { class: 'vg-spacer' }),
    el('span', { class: 'vg-kbd', text: 'Esc' }),
  ])

  const body = el('div', { class: 'ca-val-list', role: 'list' },
    list.length
      ? list.map((d, i) => diagNode(d, i === index, i))
      : [el('div', { class: 'ca-diag ca-diag--clean' }, [
        el('div', { class: 'ca-diag-what', text: 'Nothing to fix. This agenda validates clean.' }),
      ])])

  // PUBLICATION IS BLOCKED WHILE ERRORS REMAIN (SPEC 16), and the footer says
  // so rather than letting an organiser find out by pressing P. Warnings do
  // not block, so a clean-but-warned agenda says something different.
  const foot = el('div', { class: 'ca-val-foot' },
    0 < errors
      ? [
        el('span', { class: 'ca-errdot', 'aria-hidden': 'true' }),
        el('span', { text: 'Publish is blocked while errors remain — fix, then ' }),
        el('span', { class: 'vg-kbd', text: 'P' }),
      ]
      : [el('span', { class: 'vg-muted',
        text: 0 < warnings ? 'Warnings do not block publication.' : 'Ready to publish.' })])

  return el('div', {
    class: 'ca-val-panel',
    role: 'complementary',
    'aria-label': 'Validation',
    'data-validate': '',
  }, [head, body, foot])
}
