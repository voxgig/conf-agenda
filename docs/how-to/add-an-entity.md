# How to add an entity

*Diátaxis: how-to guide.*

```bash
cd backend
npx voxgig-system add entity shop/product
npx voxgig-system add field shop/product title 'price:Number' 'note:{kind:String,valid:Skip}'
npm run model-build
```

Field forms: `name` | `name:Kind` | `name:{...def}`.

## Add a relationship

A relationship field stores the target entity's id: keep
`kind: String` and add a `ref` attribute naming the target:

```bash
npx voxgig-system add field shop/order 'product_id:{kind:String,ref:"shop/product",valid:Skip}'
```

The web app derives pickers, links, and drill-down navigation from
`ref` fields automatically.

## Verify

```bash
npm run build && npm test
```

If the web env is active, reload the app - the new entity appears in
the menu with a working list/detail/form; no code needed.
