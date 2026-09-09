
// Lambda environment bootstrap. The generated handlers
// (src/handler/lambda/<srv>.ts) call getSeneca() to obtain a ready Seneca
// instance wired for the AWS Lambda + API Gateway path.
//
// Uses the default in-memory entity store - swapping in a real store
// (e.g. dynamo-store) is a deployment concern.

import Seneca from 'seneca'
import { Live } from '@voxgig/system'

import { basic, base } from '../shared/basic'

import Pkg from '../../../package.json'
import Model from '../../../model/model.json'


const STAGE = process.env.CONF_AGENDA_STAGE || 'local'

const Main = Model.main as any

let seneca: any = null


async function getSeneca(srvname: string, complete: Function): Promise<any> {
  const { deep } = Seneca.util

  if (null == seneca) {
    const srv = Main.srv[srvname]

    seneca = Seneca(deep(base.seneca, {
      tag: srvname + '-conf-agenda-' + STAGE + '@' + Pkg.version,
      timeout: srv.env.lambda.timeout * 60 * 1000,
    })).test()

    seneca.context.model = Model
    seneca.context.srvname = srvname
    seneca.context.stage = STAGE
    seneca.context.env = 'lambda'
    seneca.context.pkg = Pkg

    basic(seneca, { reload: { active: false } })

    seneca
      .use('gateway')
      .use('gateway-lambda', {
        auth: {
          token: {
            name: 'conf-agenda-auth',
          },
        },
      })
      .use('gateway-auth', {
        spec: {
          lambda_cookie: {
            active: true,
            token: {
              name: 'conf-agenda-auth',
            },
            user: {
              auth: true,
              require: srv.user?.required ?? true,
            },
          },
        },
      })

    seneca.use(Live, {
      srv: {
        name: srvname,
        folder: __dirname + '/../../srv',
      },
    })

    // Call ready() exactly once - a second ready() on an already-ready
    // instance never resolves under seneca 4.0.0-rc4.
    await seneca.ready()

    if (complete) {
      await complete(seneca)
    }
  }

  return seneca
}


export {
  getSeneca,
}
