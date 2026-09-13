// Demo/seed data for local development. The web runner already seeds the
// predefined users; add your DOMAIN seed data here (projects, lists, items,
// ...). Runs once per boot against the in-memory store. Create-once —
// customise freely.

export async function seedDemo(
  seneca: any,
  usersByEmail: Record<string, any>,
): Promise<void> {
  // The `tiny` conference (test/fixtures/tiny), so `npm run web` shows a real
  // agenda rather than an empty grid. Same rows the tests use, loaded from the
  // same file - the dev app and the suite cannot drift apart.
  const owner = Object.values(usersByEmail)[0]
  if (!owner) return

  const already = await seneca.entity('cag/fixture').list$({})
  if (0 < already.length) return

  // eslint-disable-next-line
  const Fs = require('node:fs')
  // eslint-disable-next-line
  const Path = require('node:path')
  const file = Path.join(__dirname, '../../../test/fixtures/tiny/tiny.json')
  if (!Fs.existsSync(file)) return
  const tiny = JSON.parse(Fs.readFileSync(file, 'utf8'))

  for (const canon of [
    'cag/room', 'cag/track', 'cag/speaker', 'cag/fixture', 'cag/appearance',
  ]) {
    for (const row of tiny[canon]) {
      await seneca.entity(canon).data$({ ...row, id$: row.id, owner_id: owner.id }).save$()
    }
  }

  // Leave the deliberate clash in place: the grid should show a real
  // programme, and Stage 2's live validation has something to find.

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
