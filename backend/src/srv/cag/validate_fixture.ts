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
const { sortDiagnostics } = require('../../lib/validate/diagnostic')

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
