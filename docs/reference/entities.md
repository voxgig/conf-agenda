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
  cag_snapshot {
    String agenda_json
    String id
    String org_id FK
    Number published_at
    Number schema_version
    String slug
    Number t_c
    Number t_m
    String top_id FK
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
  sys_calendar_account {
    String calendar_id
    String id
    String name
    String org_id FK
    String provider
    String secret_ref
    String status
    Number t_c
    Number t_m
  }
  sys_calendar_job {
    String account_id FK
    String action
    Number attempts
    String claim
    Number claim_at
    String fixture_id
    String id
    String item_json
    String last_error
    Number ms
    Number next_at
    String org_id FK
    String run_id FK
    String state
    Number t_c
    Number t_m
    String top_id FK
    String uid
  }
  sys_calendar_link {
    String account_id FK
    String content_hash
    String fixture_id FK
    String id
    String last_error
    Number last_sync
    String org_id FK
    String provider_event_id
    Number sequence
    String spec_json
    String state
    Number t_c
    Number t_m
    String top_id FK
    String uid
  }
  sys_calendar_run {
    String counts_json
    String id
    String org_id FK
    String state
    Number t_c
    Number t_end
    Number t_m
    Number t_start
    String top_id FK
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
  sys_org ||--o{ cag_snapshot : "org_id"
  cag_fixture ||--o{ cag_snapshot : "top_id"
  sys_org ||--o{ cag_speaker : "org_id"
  sys_org ||--o{ cag_track : "org_id"
  sys_org ||--o{ sys_calendar_account : "org_id"
  sys_calendar_account ||--o{ sys_calendar_job : "account_id"
  sys_org ||--o{ sys_calendar_job : "org_id"
  sys_calendar_run ||--o{ sys_calendar_job : "run_id"
  cag_fixture ||--o{ sys_calendar_job : "top_id"
  sys_calendar_account ||--o{ sys_calendar_link : "account_id"
  cag_fixture ||--o{ sys_calendar_link : "fixture_id"
  sys_org ||--o{ sys_calendar_link : "org_id"
  cag_fixture ||--o{ sys_calendar_link : "top_id"
  sys_org ||--o{ sys_calendar_run : "org_id"
  cag_fixture ||--o{ sys_calendar_run : "top_id"
```

(Entity ids are canons with `/` shown as `_`.)

## Entities

| Canon | Fields | Relationships | UI |
|---|---|---|---|
| `cag/appearance` | fixture_id, id, invite, order, org_id, role, speaker_id, t_c, t_m | fixture_id → cag/fixture<br>org_id → sys/org<br>speaker_id → cag/speaker | generic admin |
| `cag/fixture` | desc, embed, id, kind, org_id, p_gc, p_lat, p_lng, p_name, p_web, parent_id, private, room_id, slug, status, t_c, t_end, t_m, t_start, t_tzn, title, top_id, track_id, w_deck, w_site, w_video | org_id → sys/org<br>parent_id → cag/fixture<br>room_id → cag/room<br>top_id → cag/fixture<br>track_id → cag/track | custom view |
| `cag/room` | access, capacity, floor, id, name, order, org_id, t_c, t_m | org_id → sys/org | generic admin |
| `cag/snapshot` | agenda_json, id, org_id, published_at, schema_version, slug, t_c, t_m, top_id | org_id → sys/org<br>top_id → cag/fixture | generic admin |
| `cag/speaker` | bio, email, id, name, org_id, org_name, photo, t_c, t_m, w_site | org_id → sys/org | generic admin |
| `cag/track` | color, desc, id, name, order, org_id, t_c, t_m | org_id → sys/org | generic admin |
| `sys/calendar_account` | calendar_id, id, name, org_id, provider, secret_ref, status, t_c, t_m | org_id → sys/org | generic admin |
| `sys/calendar_job` | account_id, action, attempts, claim, claim_at, fixture_id, id, item_json, last_error, ms, next_at, org_id, run_id, state, t_c, t_m, top_id, uid | account_id → sys/calendar_account<br>org_id → sys/org<br>run_id → sys/calendar_run<br>top_id → cag/fixture | generic admin |
| `sys/calendar_link` | account_id, content_hash, fixture_id, id, last_error, last_sync, org_id, provider_event_id, sequence, spec_json, state, t_c, t_m, top_id, uid | account_id → sys/calendar_account<br>fixture_id → cag/fixture<br>org_id → sys/org<br>top_id → cag/fixture | generic admin |
| `sys/calendar_run` | counts_json, id, org_id, state, t_c, t_end, t_m, t_start, top_id | org_id → sys/org<br>top_id → cag/fixture | generic admin |
| `sys/login` | id | — | generic admin |
| `sys/user` | id | — | generic admin |
