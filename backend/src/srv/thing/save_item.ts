//// Example action: create or update a 'thing' item.
////
//// Note what is NOT here: @seneca/owner fills owner_id from the acting
//// principal and scopes the query (once something puts that principal on
//// custom.sysowner - the generic entity service that comes with
//// `voxgig-system add env web` does; a bare scaffold has no request layer
//// yet, so owner stays inert until then), and @seneca/entity-util maintains
//// t_c/t_m. An action that sets either by hand fights the plugins - and
//// hand-rolled timestamps lose t_c on update.
////
//// owner_id is dropped from the incoming data on purpose: a row the
//// client loaded carries it, and owner rejects a write whose payload
//// disagrees with the acting owner.

// module.exports = function make_save_item() {
//   return async function save_item(this: any, msg: any) {
//     const seneca = this
//
//     const data = Object.assign({}, msg.item)
//     delete data.owner_id
//
//     const item = await seneca.entity('app/thing').data$(data).save$()
//
//     return { ok: !!item, item }
//   }
// }
