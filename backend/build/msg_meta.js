// Generation action: msg_meta. Strips `inverse` from the in-memory model
// before the Lambda generators see it.
//
// WHY THIS EXISTS.
//
// PLATFORM 1.4 makes `inverse` part of a message definition - the declared
// undo contract, which the browser store's undo log is built from. Aontu is
// happy with it (msg.aon carries no element spread, and @voxgig/model's
// checkMsg validates only `pat`, `file` and duplicate patterns), and it
// serialises into model/model.json intact, which is exactly what the SPA
// needs: it fetches /model.json and reads main.msg.
//
// But @voxgig/build's MsgMetaShape is a CLOSED Gubu shape over
// { file, params, doc, out, web, api, transport }, and both res_yml and
// srv_handler apply it to every message in the model. An `inverse` anywhere
// in main.msg therefore fails the build with:
//
//     MsgMeta: Validation failed ... the property "inverse" is not allowed.
//
// AND IT FAILS AS A FALSE GREEN, which is the dangerous part. Producer order
// is msg -> model -> local, so model_producer has already WRITTEN
// model/model.json by the time the local generators run. The file on disk
// looks correct. Then the build exits 1 - and since `npm run build` is
// `model-build && tsc`, tsc never runs, so `npm test` passes against the
// PREVIOUS dist-test. Everything looks fine and nothing was compiled.
//
// So: model.json keeps `inverse` (written earlier, by model_producer) and the
// generators are handed a shape they accept. This action must therefore run
// FIRST in sys.model.order.action.
//
// THE REAL FIX IS UPSTREAM - `inverse: Skip({})` in
// @voxgig/build/src/shape/msg.ts. It is on the list to raise with Richard;
// this is the bridge until it lands, and it should be deleted the day it
// does. Nothing else in the build reads `inverse`.

/** Every place the generators might read the message list from. */
function msgLists(model, build) {
  const seen = new Set()
  const out = []
  for (const root of [model, build && build.model]) {
    const list = root && root.main && root.main.msg
    if (Array.isArray(list) && !seen.has(list)) {
      seen.add(list)
      out.push(list)
    }
  }
  return out
}

module.exports = async function (model, build) {
  let stripped = 0

  for (const list of msgLists(model, build)) {
    for (const def of list) {
      if (def && null != def.inverse) {
        delete def.inverse
        stripped++
      }
    }
  }

  // Deliberately quiet on zero: the common case is a model with no undoable
  // messages yet, and a line of build output per pass is noise.
  if (0 < stripped) {
    console.log('msg_meta: withheld `inverse` from ' + stripped +
      ' message definition(s) - model.json keeps them; @voxgig/build cannot.')
  }
}
