# Reference: system map (generated)

<!-- AUTO-GENERATED from the model by @voxgig/build (doc_gen) - do not edit. -->

*Diátaxis: reference — the system structure and its dependencies,
derived from the model.*

## Architecture

```mermaid
flowchart TB
  client([Clients]) -->|aim:*| gateway{{gateway}}
  subgraph services[Services]
    srv_cag[cag]
  end
  gateway --> srv_cag
  subgraph data[Entities]
    subgraph zone_cag[zone cag]
      cag_appearance[appearance]
      cag_fixture[fixture]
      cag_room[room]
      cag_speaker[speaker]
      cag_track[track]
    end
    subgraph zone_sys[zone sys]
      sys_login[login]
      sys_user[user]
    end
  end
  srv_cag --> data
```

## Target environments

```mermaid
flowchart LR
  model[(model.json)]
  model --> env_local[env local]
```

Active environments: `local`.

See also: [entities](entities.md) · [messages](messages.md).
