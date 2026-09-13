
import Seneca from 'seneca'

import { entity } from '@voxgig/util'

import Model from '../../../../model/model.json'

const { base } = require('../../../../dist/env/shared/basic')


// Build a Seneca instance with the generic entity service loaded from the
// compiled dist/srv. In-memory entity store, no external deps.
//
// @seneca/owner is loaded with the SAME options as the running app (from
// `base`): access control is enforced in the entity layer, so a test
// harness without it would exercise a system that cannot deny anything.
async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  return seneca
    .test()
    .use('promisify')
    .use('entity', {
      strict: true,
      ent: entity(Model),
    })
    .use('entity-util', {
      when: { active: true },
    })
    .use('owner', base.options.owner)
    .use('reload')
    .use('../../../../dist/srv/ent/ent-srv')
    .ready()
}


// Post a message AS a given user, injecting the gateway-style principal into
// meta.custom (mirrors what @seneca/gateway-auth attaches from the cookie).
function as(seneca: any, user: any, msg: any) {
  return seneca.post(Object.assign({}, msg, {
    custom$: { principal: { user } },
  }))
}


export {
  makeSeneca,
  as,
  Model,
}
