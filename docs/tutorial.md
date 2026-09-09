# Tutorial: getting started with conf-agenda

*Diátaxis: tutorial - hands-on first steps in this project.*

## 1. Install and verify

```bash
cd backend
npm install
npm run build
npm test          # green out of the box
npm run local     # boot the (empty) backend
```

## 2. First entity

```bash
npx voxgig-system add entity app/thing
npx voxgig-system add field app/thing title 'done:Boolean'
npm run model-build
```

The entity is now part of the model (`backend/model/model.json`) and
usable through the Seneca entity layer. (Alternatively, uncomment the
worked `thing` example in `model/*.aon` and `src/srv/` - a single
`#` / `//` marks disabled example code.)

## 3. A service and a message

```bash
npx voxgig-system add srv thing
npx voxgig-system add msg thing.get.info
npm run model-build
```

Create `backend/src/srv/thing/get_info.ts` with an action function -
the message `aim:thing,get:info` maps to it by name. Then
`npm run build && npm test`.

## 4. The web app

```bash
npx voxgig-system add env web
npm run model-build
npm run build
npm run web
```

This generates a complete model-driven web app under `web/` (public
site, login, entity admin UI, settings, light/dark theme) - see the
web how-to guides in this docs folder once generated.
