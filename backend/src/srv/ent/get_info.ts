module.exports = function make_get_info() {
  return async function get_info(this: any, _msg: any) {
    return { ok: true, srv: 'ent' }
  }
}
