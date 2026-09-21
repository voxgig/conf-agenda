# Reference: system map (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — the system structure and its dependencies,
derived from the model.*

## Architecture

```mermaid
flowchart TB
  subgraph spa[Web SPA]
    shell[cmp/shell]
    admin[cmp/admin]
    publiccmp[cmp/public + cmp/auth]
    settings[cmp/settings]
    view_cag_fixture[cmp/view/cag_fixture]
    bus[(Seneca bus)]
    shell --> bus
    admin --> bus
    publiccmp --> bus
    settings --> bus
    view_cag_fixture --> bus
  end
  bus -->|aim:* over browser transport| gateway{{gateway}}
  subgraph services[Services]
    srv_agenda[agenda]
    srv_auth[auth]
    srv_cag[cag]
  end
  gateway --> srv_agenda
  gateway --> srv_auth
  gateway --> srv_cag
  subgraph data[Entities]
    subgraph zone_cag[zone cag]
      cag_appearance[appearance]
      cag_fixture[fixture]
      cag_room[room]
      cag_snapshot[snapshot]
      cag_speaker[speaker]
      cag_track[track]
    end
    subgraph zone_sys[zone sys]
      sys_calendar_account[calendar_account]
      sys_calendar_job[calendar_job]
      sys_calendar_link[calendar_link]
      sys_calendar_run[calendar_run]
      sys_login[login]
      sys_user[user]
    end
  end
  srv_agenda --> data
  srv_auth --> data
  srv_cag --> data
```

## Target environments

```mermaid
flowchart LR
  model[(model.json)]
  model --> env_local[env local]
  model --> env_web[env web]
```

Active environments: `local`, `web`.

See also: [entities](entities.md) · [messages](messages.md).
