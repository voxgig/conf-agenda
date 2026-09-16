
import { v4 } from 'uuid'

import { entity } from '@voxgig/util'

import Model from '../../../model/model.json'

import FixtureTree from '../../concern/FixtureTree/FixtureTree'
import CalendarSync from '../../concern/CalendarSync/CalendarSync'
import CalendarSafety from '../../concern/CalendarSync/CalendarSafety'
import FakeProvider from '../../concern/CalendarSync/FakeProvider'


// Core seneca setup shared by the local runner and (optionally) tests.
//
// `user` provides user records; @seneca/gateway-auth resolves the
// signed-in principal and puts it on the message meta. Access control is
// enforced by @seneca/owner at the ENTITY layer (see the `owner` options
// below), not re-implemented in each action:
//   - `owner_id` + `project_id` are the two ownership axes;
//   - the `member` role scopes to project_id, so project membership grants
//     access to the whole project's data;
//   - `ignore` keeps the sys zone unscoped, which is what a blanket
//     `annotate: ['sys:entity']` got wrong before (it scoped sys/user too
//     and broke self-service password changes).
// The aim:web proxies resolve the caller's project and put the owner axes
// on custom.sysowner - see src/srv/ent/access.ts (ownerOf).
const base = {
  seneca: {
    timeout: 5 * 60 * 1000,
    legacy: false,
    log: {
      logger: 'flat',
      level: 'warn',
    },
  },
  options: {
    promisify: {},
    entity: {
      generate_id: () => v4().split('-').join(''),
      ent: entity(Model),
    },
    entity_util: {
      when: {
        active: true,
        human: 'y',
      },
    },
    user: {
      fields: {
        standard: ['id', 'handle', 'email', 'name', 'active'],
      },
    },
    fixturetree: {},
    calendarsync: {},
    reload: {},

    // Access control, enforced by @seneca/owner at the entity layer rather
    // than by hand in each action. Two ownership axes:
    //
    //   owner_id   the creating user (from the gateway principal)
    //   project_id the project the row belongs to (the TENANT axis)
    //
    // The `member` role scopes to project_id, which relaxes the axes more
    // specific than it (owner_id) and keeps project_id enforced: every
    // member of a project sees ALL of that project's rows, whoever created
    // them. That is exactly the collaboration semantic this app wants, and
    // it is enforced on load/list/save/remove alike - so a row cannot be
    // read, moved or overwritten from outside its project.
    //
    // `ignore` keeps the sys zone out of it. sys/user must stay unscoped
    // (self-service password changes, member pickers); blanket-annotating
    // `sys:entity` without this is why owner was previously removed.
    owner: {
      ownerprop: 'sysowner',
      fields: ['owner_id', 'project_id'],
      annotate: ['sys:entity'],
      ignore: ['sys:entity,base:sys'],
      rolesys: true,
      roles: {
        member: {
          scope: 'project_id',
          grants: [
            { entity: '*' },
            // The project row IS the tenant, so it carries no project_id
            // for owner to match against - matching one would deny every
            // update. There is no axis to enforce here: membership of the
            // row's OWN id is the only possible check, and access.ts makes
            // it (ownerOf) before the save. Narrower grants win over the
            // '*' grant above.
            {
              entity: 'proj/project',
              spec: {
                read: { project_id: false },
                write: { project_id: false },
                inject: { project_id: false },
              },
            },
          ],
        },
        // Entities with no ref to proj/project are not project data, so
        // they scope by the owner alone: no `scope`, and project_id is
        // switched off so it is neither injected nor queried.
        user: {
          grants: [{
            entity: '*',
            spec: {
              read: { project_id: false },
              write: { project_id: false },
              inject: { project_id: false },
            },
          }],
        },
        // Internal bookkeeping (seeding, membership rows, resolving which
        // project a row belongs to before its owner is known). Never
        // reachable from a request: the aim:web proxies only ever mint a
        // `member` owner from the gateway principal.
        system: { scope: '*', grants: [{ entity: '*' }] },
      },
    },
  },
}


function basic(seneca: any, options?: any) {
  options = options || {}
  const deep = seneca.util.deep

  seneca
    .use('promisify', deep(base.options.promisify, options.promisify))
    .use('entity', deep(base.options.entity, options.entity))
    // entity-util `when` maintains t_c/t_m (+ human t_ch/t_mh) on every
    // save - actions must NOT set them by hand.
    .use('entity-util', deep(base.options.entity_util, options.entity_util))
    .use('user', deep(base.options.user, options.user))
    .use('owner', deep(base.options.owner, options.owner))
    .use('reload', deep(base.options.reload, options.reload))

  // Concerns: shared business logic several services need identically
  // (PLATFORM 1.5). Loaded once here, called over the bus as `concern:*`,
  // never imported by a service. No `aim:` surface, so never gateway- or
  // API-reachable.
  seneca.use(FixtureTree, deep(base.options.fixturetree, options.fixturetree))

  // The sync ledger and reconciliation (SPEC 10.3). Answers sys:calendar,*
  // rather than concern:* because those are the patterns SPEC 10.2 names and
  // they are destined for senecajs/Calendar upstream. No aim: surface either
  // way, so nothing here is gateway-reachable.
  seneca.use(CalendarSync, deep(base.options.calendarsync, options.calendarsync))

  // The safety chain, layered ABOVE the provider dispatch with prior-wraps:
  // cap (C5) -> redaction (C7) -> ledger gate (C2/C3). Loaded AFTER
  // CalendarSync, because each same-pattern definition wraps the previous and
  // the outermost has to be registered last. Every provider inherits these,
  // including ones nobody has written yet - which is the whole reason they sit
  // here rather than inside a provider or inside a caller.
  seneca.use(CalendarSafety, deep(base.options.calendarsync, options.calendarsync))

  // The recording provider. Loaded ALWAYS, not only in tests: the ledger is
  // proven against it before any real provider exists, and Stage 1 has no
  // other provider to dispatch to. It sends nothing anywhere.
  seneca.use(FakeProvider)

  return seneca
}


export {
  basic,
  base,
}
