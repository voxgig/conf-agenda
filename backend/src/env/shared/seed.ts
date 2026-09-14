// Demo/seed data for local development. The web runner already seeds the
// predefined users; add your DOMAIN seed data here (projects, lists, items,
// ...). Runs once per boot against the in-memory store. Create-once —
// customise freely.

export async function seedDemo(
  seneca: any,
  usersByEmail: Record<string, any>,
): Promise<void> {
  // Two conferences, both from test/fixtures - the same rows the suite uses,
  // so the dev app and the tests cannot drift apart.
  //
  //   tiny  - carries a DELIBERATE room clash, so it does NOT publish. The
  //           grid shows it, and `validate` has something real to find.
  //   demo  - two days with explicit day fixtures (a three-level tree), three
  //           rooms, a cancelled session. Validates clean, so it publishes and
  //           the public path, the feeds and the embed all have something to
  //           serve.
  const owner = Object.values(usersByEmail)[0]
  if (!owner) return

  const already = await seneca.entity('cag/fixture').list$({})
  if (0 < already.length) return

  // eslint-disable-next-line
  const Fs = require('node:fs')
  // eslint-disable-next-line
  const Path = require('node:path')

  for (const name of ['tiny/tiny', 'demo/demo']) {
    const file = Path.join(__dirname, '../../../test/fixtures/' + name + '.json')
    if (!Fs.existsSync(file)) continue
    const bundle = JSON.parse(Fs.readFileSync(file, 'utf8'))

    for (const canon of [
      'cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance',
    ]) {
      for (const row of bundle[canon] || []) {
        await seneca.entity(canon).data$({ ...row, id$: row.id, owner_id: owner.id }).save$()
      }
    }
  }

  // Publish whatever validates. A conference with errors publishes NOTHING -
  // which is the point: the public path must never serve an unpublishable
  // programme, and the seed is not allowed to route around that.
  const tops = (await seneca.entity('cag/fixture').list$({}))
    .map((r: any) => r.data$(false))
    .filter((f: any) => null == f.parent_id || '' === f.parent_id)
    .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))

  for (const top of tops) {
    await seneca.post('aim:cag,publish:fixture', { fixture_id: top.id })
  }

  // Example (uncomment and adapt to your model):
  //
  // const owner = Object.values(usersByEmail)[0]
  // if (!owner) return
  // const existing = await seneca.entity('proj/project').list$({})
  // if (existing.length > 0) return
  // const now = Date.now()
  // const p = await seneca.entity('proj/project')
  //   .data$({ name: 'Example', owner_id: owner.id, t_c: now, t_m: now }).save$()
  // await seneca.entity('proj/member')
  //   .data$({ project_id: p.id, user_id: owner.id, role: 'owner',
  //            owner_id: owner.id, t_c: now, t_m: now }).save$()
}
