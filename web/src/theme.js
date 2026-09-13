// Theme controller. The design theme and its named modes come from the model
// (main.theme); the generated theme.css defines each mode's CSS variables.
// This switches the active mode via the `data-theme-mode` attribute on <html>,
// persisting the choice in localStorage. Modes can be customised with the
// `theme:modes` hook.

import { loadModel } from './model.js'
import * as Hooks from './hooks.js'

const KEY = 'vg-theme-mode'
let _default = 'light'
let _modes = ['light']

function saved() {
  try {
    return localStorage.getItem(KEY)
  }
  catch (e) {
    return null
  }
}

function apply(mode) {
  if (_modes.indexOf(mode) < 0) {
    mode = _default
  }
  document.documentElement.setAttribute('data-theme-mode', mode)
  try {
    localStorage.setItem(KEY, mode)
  }
  catch (e) {
    // ignore storage failures
  }
}

// The available modes, filterable by the theme:modes hook.
function modes() {
  return Hooks.filter('theme:modes', _modes.slice(), {})
}

function current() {
  return document.documentElement.getAttribute('data-theme-mode') || _default
}

function setMode(mode) {
  apply(mode)
}

// Cycle to the next mode (used by the shell's mode toggle).
function nextMode() {
  const ms = modes()
  const i = ms.indexOf(current())
  setMode(ms[(i + 1) % ms.length])
  return current()
}

async function init() {
  const m = await loadModel()
  const theme = (m && m.main && m.main.theme) || {}
  _modes = Object.keys(theme.modes || { light: {} })
  _default = theme.mode || _modes[0] || 'light'
  apply(saved() || _default)
}

// Apply the persisted mode synchronously on import (before the model loads)
// to avoid a flash of the default theme; init() then refines the mode list.
if ('undefined' !== typeof document) {
  const s = saved()
  if (s) {
    document.documentElement.setAttribute('data-theme-mode', s)
  }
  init()
}

export {
  init,
  modes,
  current,
  setMode,
  nextMode,
}
