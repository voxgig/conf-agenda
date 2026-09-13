import { test, describe } from 'node:test'
import assert from 'node:assert'

import { makeSeneca, as } from './auth.setup'


// Sign-in / sign-out / session load, and the gateway wrappers that turn
// them into cookie operations for the SPA.
describe('auth session', () => {

  async function withUser() {
    const seneca = await makeSeneca()
    const reg = await seneca.post('sys:user,register:user',
      { name: 'Alice', email: 'alice@ex.com', password: 'alice-pass-01' })
    assert.strictEqual(reg.ok, true)
    return { seneca, user: reg.user }
  }


  test('signin succeeds with the right password and fails otherwise', async () => {
    const { seneca } = await withUser()

    const ok = await seneca.post('aim:auth,signin:user',
      { email: 'alice@ex.com', password: 'alice-pass-01' })
    assert.strictEqual(ok.ok, true)
    assert.strictEqual(ok.user.email, 'alice@ex.com')

    // aim:auth messages are gateway-reachable, so the result must never
    // carry credentials: @seneca/user answers with the whole entity
    // (password hash + salt) and its `fields` option does not stop it.
    assert.strictEqual(ok.user.pass, undefined)
    assert.strictEqual(ok.user.salt, undefined)
    assert.deepStrictEqual(Object.keys(ok.user).sort(),
      ['email', 'handle', 'id', 'name'])

    const bad = await seneca.post('aim:auth,signin:user',
      { email: 'alice@ex.com', password: 'wrong' })
    assert.strictEqual(bad.ok, false)

    await seneca.close()
  })


  test('the gateway wrapper returns a cookie token on success', async () => {
    const { seneca } = await withUser()

    const out = await seneca.post(
      { aim: 'web', on: 'auth', signin: 'user', email: 'alice@ex.com', password: 'alice-pass-01' })
    assert.strictEqual(out.ok, true)
    // gateway-auth (express_cookie) sets the cookie from this field.
    assert.ok(out.gateway$.auth.token)
    assert.strictEqual(out.user.email, 'alice@ex.com')
    assert.strictEqual(out.user.pass, undefined)

    const bad = await seneca.post(
      { aim: 'web', on: 'auth', signin: 'user', email: 'alice@ex.com', password: 'wrong' })
    assert.strictEqual(bad.ok, false)
    assert.strictEqual(bad.gateway$, undefined)
    assert.ok(bad.why)

    await seneca.close()
  })


  test('signout revokes the login server-side', async () => {
    const { seneca, user } = await withUser()

    const login = await seneca.post('aim:auth,signin:user',
      { email: 'alice@ex.com', password: 'alice-pass-01' })
    const token = login.login.token
    assert.ok(token)

    const before = await seneca.entity('sys/login').list$({ token })
    assert.strictEqual(before[0].active, true)

    const out = await seneca.post('aim:auth,signout:user',
      { user_id: user.id, token })
    assert.strictEqual(out.ok, true)

    // The session must really be revoked: a token alone does not do it
    // (@seneca/user answers no-user-query and leaves the row active), so
    // the user id has to travel with it.
    const after = await seneca.entity('sys/login').list$({ token })
    assert.strictEqual(after[0].active, false)

    await seneca.close()
  })


  test('the signout wrapper revokes the session and clears the cookie', async () => {
    const { seneca, user } = await withUser()

    const login = await seneca.post('aim:auth,signin:user',
      { email: 'alice@ex.com', password: 'alice-pass-01' })
    const token = login.login.token

    // The gateway principal carries both the user and the login token.
    const out = await seneca.post({
      aim: 'web', on: 'auth', signout: 'user',
      custom$: { principal: { user, token } },
    })
    assert.strictEqual(out.ok, true)
    // Tells gateway-auth to clear the cookie.
    assert.strictEqual(out.gateway$.auth.remove, true)

    const after = await seneca.entity('sys/login').list$({ token })
    assert.strictEqual(after[0].active, false)

    // Signing out with no principal at all is still a clean no-op.
    const anon = await seneca.post({ aim: 'web', on: 'auth', signout: 'user' })
    assert.strictEqual(anon.ok, true)

    await seneca.close()
  })


  test('load:auth reports the signed-in user, or nobody', async () => {
    const { seneca, user } = await withUser()

    const anon = await seneca.post({ aim: 'web', on: 'auth', load: 'auth' })
    assert.strictEqual(anon.ok, true)
    assert.strictEqual(anon.user, undefined)

    const signed = await as(seneca, user, { aim: 'web', on: 'auth', load: 'auth' })
    assert.strictEqual(signed.ok, true)
    assert.strictEqual(signed.user.email, 'alice@ex.com')
    assert.strictEqual(signed.user.pass, undefined)

    // The service message behind it must not leak credentials either.
    const direct = await seneca.post('aim:auth,load:auth', { user_id: user.id })
    assert.strictEqual(direct.ok, true)
    assert.strictEqual(direct.state, 'signedin')
    assert.strictEqual(direct.user.pass, undefined)
    assert.strictEqual(direct.user.salt, undefined)

    const gone = await seneca.post('aim:auth,load:auth', { user_id: 'nope' })
    assert.strictEqual(gone.ok, false)
    assert.strictEqual(gone.state, 'signedout')

    await seneca.close()
  })


  test('update:user changes the profile of the signed-in user only', async () => {
    const { seneca, user } = await withUser()

    const out = await as(seneca, user,
      { aim: 'web', on: 'auth', update: 'user', data: { name: 'Alicia' } })
    assert.strictEqual(out.ok, true)

    const check = await seneca.post('sys:user,get:user', { email: 'alice@ex.com' })
    assert.strictEqual(check.user.name, 'Alicia')

    const anon = await seneca.post(
      { aim: 'web', on: 'auth', update: 'user', data: { name: 'Mallory' } })
    assert.strictEqual(anon.ok, false)
    assert.strictEqual(anon.why, 'not-authenticated')

    await seneca.close()
  })


  test('remind:pass never reveals whether the account exists', async () => {
    const { seneca } = await withUser()

    const known = await seneca.post(
      { aim: 'web', on: 'auth', remind: 'pass', email: 'alice@ex.com' })
    const unknown = await seneca.post(
      { aim: 'web', on: 'auth', remind: 'pass', email: 'nobody@ex.com' })

    // Same answer either way (no user enumeration), and nothing is sent.
    assert.strictEqual(known.ok, true)
    assert.strictEqual(unknown.ok, true)
    assert.strictEqual(known.user, undefined)
    assert.strictEqual(unknown.user, undefined)

    await seneca.close()
  })


  test('get:info reports the service', async () => {
    const seneca = await makeSeneca()
    const out = await seneca.post('aim:auth,get:info')
    assert.strictEqual(out.ok, true)
    assert.strictEqual(out.srv, 'auth')
    await seneca.close()
  })
})
