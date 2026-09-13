
import Seneca from 'seneca'

import Model from '../../../../model/model.json'

// The shared plugin setup (loads @seneca/user etc.) from compiled output.
const { basic } = require('../../../../dist/env/shared/basic.js')


// Seneca with @seneca/user + the auth service (from compiled dist/srv).
async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()
  basic(seneca)

  seneca
    .use('reload')
    .use('../../../../dist/srv/auth/auth-srv')

  return seneca.ready()
}


// Post a gateway message AS a signed-in user (principal in meta.custom).
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
