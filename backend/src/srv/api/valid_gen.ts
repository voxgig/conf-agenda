/* AUTO-GENERATED from the model by @voxgig/build (api_gen) - do not edit.
   Regenerated on every model-build. */

// Request-body validation shapes for the REST API, derived from the
// entity field definitions. Shapes are CLOSED (strict JSON: unknown
// fields are rejected); server-managed fields (id, owner_id, t_c, t_m)
// are excluded entirely. create requires the required fields; update
// accepts any subset (partial).

module.exports = function makeShapes(Gubu: any) {
  const { Skip } = Gubu
  const shapes: any = {}

  shapes['cag/appearance'] = {
    create: Gubu({
      fixture_id: Skip(String),
      invite: Skip(String),
      order: Skip(Number),
      org_id: Skip(String),
      role: Skip(String),
      speaker_id: Skip(String),
    }),
    update: Gubu({
      fixture_id: Skip(String),
      invite: Skip(String),
      order: Skip(Number),
      org_id: Skip(String),
      role: Skip(String),
      speaker_id: Skip(String),
    }),
  }

  shapes['cag/fixture'] = {
    create: Gubu({
      desc: Skip(String),
      embed: Skip(String),
      kind: Skip(String),
      org_id: Skip(String),
      p_gc: Skip(String),
      p_lat: Skip(Number),
      p_lng: Skip(Number),
      p_name: Skip(String),
      p_web: Skip(String),
      parent_id: Skip(String),
      private: Skip(Boolean),
      room_id: Skip(String),
      slug: Skip(String),
      status: Skip(String),
      t_end: Skip(Number),
      t_start: Skip(Number),
      t_tzn: Skip(String),
      title: String,
      top_id: Skip(String),
      track_id: Skip(String),
      w_deck: Skip(String),
      w_site: Skip(String),
      w_video: Skip(String),
    }),
    update: Gubu({
      desc: Skip(String),
      embed: Skip(String),
      kind: Skip(String),
      org_id: Skip(String),
      p_gc: Skip(String),
      p_lat: Skip(Number),
      p_lng: Skip(Number),
      p_name: Skip(String),
      p_web: Skip(String),
      parent_id: Skip(String),
      private: Skip(Boolean),
      room_id: Skip(String),
      slug: Skip(String),
      status: Skip(String),
      t_end: Skip(Number),
      t_start: Skip(Number),
      t_tzn: Skip(String),
      title: Skip(String),
      top_id: Skip(String),
      track_id: Skip(String),
      w_deck: Skip(String),
      w_site: Skip(String),
      w_video: Skip(String),
    }),
  }

  shapes['cag/room'] = {
    create: Gubu({
      access: Skip(String),
      capacity: Skip(Number),
      floor: Skip(String),
      name: String,
      order: Skip(Number),
      org_id: Skip(String),
    }),
    update: Gubu({
      access: Skip(String),
      capacity: Skip(Number),
      floor: Skip(String),
      name: Skip(String),
      order: Skip(Number),
      org_id: Skip(String),
    }),
  }

  shapes['cag/snapshot'] = {
    create: Gubu({
      agenda_json: Skip(String),
      org_id: Skip(String),
      published_at: Skip(Number),
      schema_version: Skip(Number),
      slug: Skip(String),
      top_id: Skip(String),
    }),
    update: Gubu({
      agenda_json: Skip(String),
      org_id: Skip(String),
      published_at: Skip(Number),
      schema_version: Skip(Number),
      slug: Skip(String),
      top_id: Skip(String),
    }),
  }

  shapes['cag/speaker'] = {
    create: Gubu({
      bio: Skip(String),
      email: Skip(String),
      name: String,
      org_id: Skip(String),
      org_name: Skip(String),
      photo: Skip(String),
      w_site: Skip(String),
    }),
    update: Gubu({
      bio: Skip(String),
      email: Skip(String),
      name: Skip(String),
      org_id: Skip(String),
      org_name: Skip(String),
      photo: Skip(String),
      w_site: Skip(String),
    }),
  }

  shapes['cag/track'] = {
    create: Gubu({
      color: Skip(String),
      desc: Skip(String),
      name: String,
      order: Skip(Number),
      org_id: Skip(String),
    }),
    update: Gubu({
      color: Skip(String),
      desc: Skip(String),
      name: Skip(String),
      order: Skip(Number),
      org_id: Skip(String),
    }),
  }

  return shapes
}
