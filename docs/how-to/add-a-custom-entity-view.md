# How to add a custom entity view

*Diátaxis: how-to guide — replace the generic admin UI for one entity
with a hand-coded component, declared in the model.*

## 1. Declare it in the model

In `backend/model/ent.aontu`, mark the entity:

```
shop: product: ux: { view: 'custom' }
```

## 2. Generate the starter

```bash
cd backend && npm run model-build
```

This creates `web/src/cmp/view/shop_product.js` (a working starter
component — create-once, so your edits survive every future build) and
regenerates `web/src/views.js`, the index that imports all custom views.
The shell now mounts `<vg-view-shop-product>` instead of the generic
`<vg-entity-admin>` for that entity.

## 3. Implement the view

The component contract (same as the generic admin):

- **Properties** (set by the shell before `reload()`):
  - `canon` — the entity canon, e.g. `'shop/product'`
  - `projectId` — current project id when the entity is project-scoped,
    else `null`
  - `detailId` — an entity id to open in detail, or `null`
  - `onNavigate(canon, id)` — call to navigate elsewhere in the app
- **Method**: `reload()` — re-fetch and re-render.

Use the same building blocks the generic admin uses:

```js
import * as Model from '../../model.js'   // labels, fields, refs graph
import * as Api from '../../api.js'       // Api.list/load/save/remove(canon, ...)
```

Data via `Api` goes through the generic `aim:ent` messages, so
membership scoping and validation apply unchanged.

## Reverting

Remove the `ux` declaration and run `model-build` — `views.js` drops the
import and the entity falls back to the generic admin. Your component
file stays (delete it manually if unwanted).
