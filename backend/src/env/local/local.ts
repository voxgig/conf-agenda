
// Local runner: boots a single in-process Seneca instance with the core
// plugins and any services loaded from dist/srv. Uses the default
// in-memory entity store, so it runs with no external services.

import Seneca from 'seneca'
import { Local } from '@voxgig/system'

import { basic, base } from '../shared/basic'

import Pkg from '../../../package.json'
import Model from '../../../model/model.json'


run()


async function run() {
  const { deep } = Seneca.util

  const seneca = Seneca(deep(base.seneca, { tag: 'conf-agenda-local' }))

  seneca.context.model = Model
  seneca.context.env = 'local'
  seneca.context.stage = 'local'
  seneca.context.srvname = 'all'
  seneca.context.pkg = Pkg

  seneca.test()

  basic(seneca)

  // Dev REPL (@seneca/repl): poke the running system with messages -
  //   npx seneca-repl telnet://localhost:<port.repl>
  // Disable with REPL=false; override the port with REPL_PORT.
  if ('false' !== process.env.REPL) {
    seneca.use('repl', {
      port: parseInt(process.env.REPL_PORT || '', 10) ||
        (Model as any).main.conf.port.repl,
    })
  }

  seneca.use(Local, {
    srv: {
      folder: __dirname + '/../../../dist/srv',
    },
  })

  await seneca.ready()

  console.log('CONF-AGENDA-BACKEND STARTED', { version: Pkg.version })
}
