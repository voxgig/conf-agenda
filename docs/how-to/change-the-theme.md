# How to change the theme

*Diátaxis: how-to guide — the design theme is part of the model; modes
and tokens flow from there into generated CSS.*

## Change a token

Edit `backend/model/theme.aontu` — each named mode (light, dark, ...) is
a set of design tokens:

```
modes: {
  light: {
    primary: '#7c3aed'
    # ...
  }
}
```

Then regenerate:

```bash
cd backend && npm run model-build
```

`web/src/theme.css` is rewritten: every token becomes a CSS variable
(`--vg-primary`, ...) scoped to its mode
(`:root[data-theme-mode="light"]`; the default mode also on `:root`).
Do not edit `theme.css` by hand — it regenerates from the model.

## Add a mode

Add a new block under `modes:` (e.g. `sepia: { ... }`) with the same
token set, and set `mode:` if it should be the default. After
`model-build`, the shell's user menu automatically offers the new mode
(the toggle appears whenever more than one mode exists), and the user's
choice persists (localStorage `vg-theme-mode`).

## Override per project without touching the model

`web/src/custom.css` loads after the theme:

```css
:root { --vg-radius: 10px; }                      /* all modes */
:root[data-theme-mode="dark"] { --vg-bg: #000; }  /* one mode */
```

## Add modes or intercept the mode list at runtime

```js
// web/src/customise.js
import * as Hooks from './hooks.js'
Hooks.addFilter('theme:modes', (modes) => [...modes, 'sepia'])
```

(Provide the CSS for a runtime-added mode yourself in `custom.css`.)

## Standard tokens

`primary`, `primary-dark`, `bg`, `surface`, `text`, `muted`, `border`,
`topbar-bg`, `topbar-fg`, `accent-bg`, `font`, `radius`, `shadow-card`.
Any additional token you add becomes `--vg-<token>` too.
