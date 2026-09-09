# Reference: entities (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — the entity graph, derived from the model.*

## Entity relationship diagram

Relationships come from `ref` fields (the field stores the id of the
target entity).

```mermaid
erDiagram
  cag_appearance {
    String fixture_id FK
    String id
    String invite
    Number order
    String org_id FK
    String role
    String speaker_id FK
    Number t_c
    Number t_m
  }
  cag_fixture {
    String desc
    Object embed
    String id
    String kind
    String org_id FK
    String p_gc
    Number p_lat
    Number p_lng
    String p_name
    String p_web
    String parent_id FK
    Boolean private
    String room_id FK
    String slug
    String status
    Number t_c
    Number t_end
    Number t_m
    Number t_start
    String t_tzn
    String title
    String top_id FK
    String track_id FK
    String w_deck
    String w_site
    String w_video
  }
  cag_room {
    String access
    Number capacity
    String floor
    String id
    String name
    Number order
    String org_id FK
    Number t_c
    Number t_m
  }
  cag_speaker {
    String bio
    String email
    String id
    String name
    String org_id FK
    String org_name
    String photo
    Number t_c
    Number t_m
    String w_site
  }
  cag_track {
    String color
    String desc
    String id
    String name
    Number order
    String org_id FK
    Number t_c
    Number t_m
  }
  sys_login {
    String id
  }
  sys_user {
    String id
  }
  cag_fixture ||--o{ cag_appearance : "fixture_id"
  sys_org ||--o{ cag_appearance : "org_id"
  cag_speaker ||--o{ cag_appearance : "speaker_id"
  sys_org ||--o{ cag_fixture : "org_id"
  cag_fixture ||--o{ cag_fixture : "parent_id"
  cag_room ||--o{ cag_fixture : "room_id"
  cag_fixture ||--o{ cag_fixture : "top_id"
  cag_track ||--o{ cag_fixture : "track_id"
  sys_org ||--o{ cag_room : "org_id"
  sys_org ||--o{ cag_speaker : "org_id"
  sys_org ||--o{ cag_track : "org_id"
```

(Entity ids are canons with `/` shown as `_`.)

## Entities

| Canon | Fields | Relationships | UI |
|---|---|---|---|
| `cag/appearance` | fixture_id, id, invite, order, org_id, role, speaker_id, t_c, t_m | fixture_id → cag/fixture<br>org_id → sys/org<br>speaker_id → cag/speaker | generic admin |
| `cag/fixture` | desc, embed, id, kind, org_id, p_gc, p_lat, p_lng, p_name, p_web, parent_id, private, room_id, slug, status, t_c, t_end, t_m, t_start, t_tzn, title, top_id, track_id, w_deck, w_site, w_video | org_id → sys/org<br>parent_id → cag/fixture<br>room_id → cag/room<br>top_id → cag/fixture<br>track_id → cag/track | custom view |
| `cag/room` | access, capacity, floor, id, name, order, org_id, t_c, t_m | org_id → sys/org | generic admin |
| `cag/speaker` | bio, email, id, name, org_id, org_name, photo, t_c, t_m, w_site | org_id → sys/org | generic admin |
| `cag/track` | color, desc, id, name, order, org_id, t_c, t_m | org_id → sys/org | generic admin |
| `sys/login` | id | — | generic admin |
| `sys/user` | id | — | generic admin |
