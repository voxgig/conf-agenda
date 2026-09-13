# Reference: the web app

*Diátaxis: reference — the generated SPA's structure, messages, hook
points, and theme contract.*

## Files (web/src/)

| File | Role | Regenerated? |
|---|---|---|
| `main.js` | Entry: imports css, bus, components, views, customise | no |
| `bus.js` | The browser Seneca bus (transport to the backend gateway) | no |
| `model.js` | Runtime model: fetches `/model.json`; entities, refs graph, labels, project scoping, custom-view tags | no |
| `api.js` | Client for `aim:ent` CRUD + `aim:auth` | no |
| `hooks.js` | Customisation hook registry | no |
| `theme.js` | Theme mode controller (persisted; applies `data-theme-mode`) | no |
| `style.css` | App styles (consume `--vg-*` variables) | no |
| `theme.css` | CSS variables per theme mode | **yes — from the model** |
| `views.js` | Index importing custom entity views | **yes — from the model** |
| `customise.js` / `custom.css` | Project customisations | no (yours) |
| `cmp/app.js` | Router: signed-out → public, signed-in → shell | no |
| `cmp/public.js` | Public site + login mount | no |
| `cmp/auth.js` | Login / forgot-password form | no |
| `cmp/shell.js` | App shell: topbar, project selector, user menu, entity nav | no |
| `cmp/admin.js` | Generic entity admin (list/detail/form, relationship drill) | no |
| `cmp/settings.js` | Profile + change password | no |
| `cmp/view/*.js` | Custom entity views (one per `ux:{view:'custom'}` entity) | no (starters) |

## Backend messages used

**The browser may only send `aim:web` messages.** The gateway allow-list
names that one namespace, and every message the SPA sends is declared in
the model as an `aim:web` PROXY that forwards to the real service message
(`web_*` action files). Service namespaces (`aim:auth`, `aim:ent`,
`aim:api`, ...) are internal: posting one from a browser is rejected with
`not-allowed`. API-key clients have the same shape - the REST router
posts `aim:api`, which is likewise not browser-reachable.

| Browser message | Proxies to | Purpose |
|---|---|---|
| `aim:web,on:ent,cmd:list,ent:<canon>` (+`q`) | `aim:ent,cmd:list` | List (membership/project-scoped) |
| `aim:web,on:ent,cmd:load,ent:<canon>` (+`id`) | `aim:ent,cmd:load` | Load one |
| `aim:web,on:ent,cmd:save,ent:<canon>` (+`item`) | `aim:ent,cmd:save` | Create/update |
| `aim:web,on:ent,cmd:remove,ent:<canon>` (+`id`) | `aim:ent,cmd:remove` | Delete |
| `aim:web,on:auth,load:auth` | `aim:auth,load:auth` | Current principal |
| `aim:web,on:auth,signin:user` / `signout:user` | `aim:auth,*` | Session (sets/clears the cookie) |
| `aim:web,on:auth,change:pass` / `update:user` | `aim:auth,*` | Settings & security |
| `aim:web,on:auth,remind:pass` | `aim:auth,remind:pass` | Password reminder (server stub) |
| `aim:web,on:auth,create:apikey` / `list:apikey` / `revoke:apikey` | `aim:auth,*` | API keys |

To expose a new operation to the browser, declare an `aim:web` proxy for
it in the model and implement the `web_*` action - never widen the
allow-list.

## Hook points

Register in `customise.js`; kinds: `html` (inject markup), `filter`
(transform a value), `action` (side effect). All synchronous,
failure-isolated.

| Point | Kind | Context / value |
|---|---|---|
| `shell:topbar:right` | html | `{ user }` |
| `shell:sidebar:top` | html | `{ user }` |
| `shell:nav:items` | filter | entity list for the nav menu |
| `admin:list:toolbar` | html | list toolbar region |
| `admin:list:items` | filter | rows before render |
| `admin:list:columns` | filter | column defs |
| `admin:row:actions` | html | per-row action cell |
| `admin:list:after` | action | `{ root, canon, items }` |
| `admin:form:fields` | filter | form field defs |
| `admin:form:extra` | html | extra form markup |
| `admin:form:after` | action | after form render |
| `admin:save:data` | filter | payload before save |
| `admin:save:after` | action | after successful save |
| `public:sections` | html | extra public-site sections |
| `auth:form:footer` | html | login form footer |
| `settings:sections` | html | extra settings sections |
| `theme:modes` | filter | available theme mode list |

## Theme contract

- Model: `main.theme` = `{ mode, modes: { <name>: { <token>: <value> } } }`
  (source: `backend/model/theme.aontu`).
- Generated CSS: each token → `--vg-<token>` under
  `:root[data-theme-mode="<name>"]`; default mode also on `:root`.
- Runtime: `theme.js` sets `data-theme-mode` on `<html>`; choice persists
  in localStorage `vg-theme-mode`; shell user menu toggles when more than
  one mode exists.
- Standard tokens: `primary`, `primary-dark`, `bg`, `surface`, `text`,
  `muted`, `border`, `topbar-bg`, `topbar-fg`, `accent-bg`, `font`,
  `radius`, `shadow-card`.

## Custom entity view contract

Tag `vg-view-<zone>-<name>`; properties `canon`, `projectId`, `detailId`,
`onNavigate(canon, id)`; method `reload()`. Declared by
`ux: { view: 'custom' }` on the model entity.
