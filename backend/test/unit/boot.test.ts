
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import Seneca from 'seneca'

import Model from '../../model/model.json'

// The shared plugin setup, loaded from the compiled output (run
// `npm run build` before `npm test`).
const { basic } = require('../../dist/env/shared/basic.js')


async function makeSeneca() {
  const seneca = Seneca({ legacy: false, timeout: 2222, debug: { undead: true } })
  seneca.context.model = Model
  seneca.context.env = 'test'

  seneca.test()
  basic(seneca)

  return seneca.ready()
}


describe('boot', () => {

  test('core-plugins-load', async () => {
    const seneca = await makeSeneca()

    expect(seneca.find_plugin('entity')).exist()
    expect(seneca.find_plugin('user')).exist()

    await seneca.close()
  })


  test('sys-entities-usable', async () => {
    const seneca = await makeSeneca()

    const user = await seneca.entity('sys/user').save$({
      handle: 'alice',
      email: 'alice@example.com',
    })

    expect(user.id).exist()
    expect(user.handle).equal('alice')

    const found = await seneca.entity('sys/user').load$({ id: user.id })
    expect(found.handle).equal('alice')

    await seneca.close()
  })

})
