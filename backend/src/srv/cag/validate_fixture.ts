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

    const rooms =
      null == top?.org_id
        ? []
        : (await seneca.entity('cag/room').list$({ org_id: top.org_id })).map((r: any) =>
            r.data$(false),
          )

    // One array per rule, concatenated. Adding a rule is adding a line here
    // and a file beside room_double_booked - each is self-contained
    // (SPEC 22 names validation rules as the unit that delegates well).
    const diagnostics = sortDiagnostics([
      //
      ...roomDoubleBooked(segments, rooms),
    ])

    const errors = diagnostics.filter((d: any) => 'error' === d.severity)
    const warnings = diagnostics.filter((d: any) => 'warn' === d.severity)

    return {
      ok: true,
      // `valid` is the gate publish and apply:sync read. `ok` only says the
      // action itself ran.
      valid: 0 === errors.length,
      fixture_id: msg.fixture_id,
      top_id: tree.top_id,
      diagnostics,
      error_count: errors.length,
      warn_count: warnings.length,
    }
  }
}
