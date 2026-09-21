//// aim:cag,validate:fixture - run the validation rules over a fixture tree.
////
//// SPEC 16: mechanically-detectable errors, caught before publication and
//// before any invitation goes out. This action is the single entry point;
//// publish and apply:sync both gate on it.
////
//// Constraints expressible in the model are enforced there and are NOT
//// repeated here (SPEC 16). What runs here is only the relational and
//// temporal rules - the ones that compare entities to each other.

const { roomDoubleBooked } = require('../../lib/validate/room_double_booked')
const { speakerDoubleBooked } = require('../../lib/validate/speaker_double_booked')
const { treeShape } = require('../../lib/validate/tree_shape')
const { references } = require('../../lib/validate/references')
const { warnings: warningRules } = require('../../lib/validate/warnings')
const { cycles } = require('../../lib/validate/cycle')
const { colorContrast } = require('../../lib/validate/color_contrast')
const { assets: assetRules } = require('../../lib/validate/assets')
const { sortDiagnostics } = require('../../lib/validate/diagnostic')
const { makeAssetCheck } = require('../../lib/assets')

//// Where a track colour is actually drawn: the CARD SURFACE, in both modes.
//// Read from the model rather than restated, so a theme change cannot leave
//// this rule checking against a background the app no longer uses.
function surfacesOf(model: any): Record<string, string> {
  const modes = model && model.main && model.main.theme && model.main.theme.modes
  if (null == modes) return {}
  const out: Record<string, string> = {}
  for (const mode of Object.keys(modes)) {
    const surface = modes[mode] && modes[mode].surface
    if ('string' === typeof surface) out[mode] = surface
  }
  return out
}

//// One checker per call, bound to the configured assets root. The rules stay
//// pure - the filesystem work happens here and reaches them as facts.
let assetCheck: any = null
function assetCheckFor(seneca: any) {
  if (null == assetCheck) {
    const conf = seneca.context && seneca.context.model
      && seneca.context.model.main && seneca.context.model.main.conf
    const root = (conf && conf.assets && conf.assets.root) || 'assets'
    assetCheck = makeAssetCheck(root)
  }
  return assetCheck
}

module.exports = function make_validate_fixture() {
  return async function validate_fixture(this: any, msg: any) {
    const seneca = this

    // One load for the whole tree, with effective status and privacy already
    // resolved along each ancestor chain. Rules consume EFFECTIVE values, never
    // a node's own fields (SPEC 8) - otherwise one confirmed child under an
    // unfinished day is judged as if the day were finished.
    const tree = await seneca.post('concern:fixture,resolve:tree', {
      fixture_id: msg.fixture_id,
    })

    if (!tree.ok) {
      return { ok: false, why: tree.why }
    }

    const top = tree.nodes.find((n: any) => n.id === msg.fixture_id)
    const segments = tree.nodes.filter((n: any) => n.id !== msg.fixture_id)

    const plain = (list: any[]) => list.map((r: any) => r.data$(false))
    const q = { org_id: top.org_id }
    const rooms = null == top?.org_id ? [] : plain(await seneca.entity('cag/room').list$(q))
    const tracks = null == top?.org_id ? [] : plain(await seneca.entity('cag/track').list$(q))
    const speakers = null == top?.org_id ? [] : plain(await seneca.entity('cag/speaker').list$(q))
    const appearances =
      null == top?.org_id ? [] : plain(await seneca.entity('cag/appearance').list$(q))

    // Everything that claims this conference as its top, reachable or not.
    // `top_id` is server-managed and denormalised precisely so a lookup does
    // not have to walk a tree that may be broken.
    const claimed = null == top?.org_id ? segments : plain(
      await seneca.entity('cag/fixture').list$({ org_id: top.org_id, top_id: tree.top_id }))
      .filter((f: any) => f.id !== top.id)

    const input = { top, segments, rooms, tracks, speakers, appearances }

    // One array per rule, concatenated. Adding a rule is adding a line here
    // and a file beside room_double_booked - each is self-contained
    // (SPEC 22 names validation rules as the unit that delegates well).
    const diagnostics = sortDiagnostics([
      // Errors - publication blocked (SPEC 16.1)
      ...roomDoubleBooked(segments, rooms),
      ...speakerDoubleBooked(input),
      ...treeShape(input),
      ...references(input),
      // The runtime pair of the ontology's `contains: acyclic`. The save-time
      // guard stops a cycle being CREATED; this finds one already in the data.
      //
      // OVER A DIFFERENT NODE SET, and it has to be. A cycle is by definition
      // UNREACHABLE from the top - none of its members has an ancestor chain
      // that arrives at the conference - so resolve:tree never returns one
      // and the rule run over `segments` could never fire. It is scoped by
      // the denormalised `top_id` instead: fixtures that still claim to
      // belong to this conference even though the tree can no longer reach
      // them. Scoping by org alone would let a corrupt tree in one conference
      // block publication of another.
      ...cycles({ ...input, segments: claimed }),
      // A track colour is organiser data, so nobody has checked it (SPEC 16.1).
      ...colorContrast(input, surfacesOf(seneca.context.model)),
      // Existence is not containment - assets.ts checks both.
      ...assetRules(input, assetCheckFor(seneca)),
      // Warnings - said, not enforced (SPEC 16.2)
      ...warningRules(input),
    ])

    const errors = diagnostics.filter((d: any) => 'error' === d.severity)
    const warns = diagnostics.filter((d: any) => 'warn' === d.severity)

    return {
      ok: true,
      // `valid` is the gate publish and apply:sync read. `ok` only says the
      // action itself ran.
      valid: 0 === errors.length,
      fixture_id: msg.fixture_id,
      top_id: tree.top_id,
      diagnostics,
      error_count: errors.length,
      warn_count: warns.length,
    }
  }
}
