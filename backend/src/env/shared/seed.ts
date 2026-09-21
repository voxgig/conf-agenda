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

  // A connected calendar, so the sync plan has something to plan against.
  // `fake` is the only provider that exists at this stage and it RECORDS
  // rather than sends - nothing here can reach a real person. Without it the
  // sync screen is an empty table, which looks broken rather than deliberate.
  const accounts = await seneca.entity('sys/calendar_account').list$({})
  if (0 === accounts.length) {
    for (const org of ['org_tiny', 'org_demo']) {
      await seneca.entity('sys/calendar_account').data$({
        id$: 'acct_' + org,
        org_id: org,
        name: 'demo calendar',
        provider: 'fake',
        calendar_id: 'primary',
        // A sekreto NAME, never token material (C7) - and there is no token
        // behind it either: the fake needs no credentials.
        secret_ref: 'sekreto:demo-calendar',
        status: 'active',
        owner_id: owner.id,
      }).save$()
    }
  }

  // GIVE THE LEDGER A HISTORY, by replaying the sequence a real organiser is
  // actually in when they open the sync plan: you synced, then things changed.
  //
  // Without this the screen can only ever show one thing - every row a create
  // before the first sync, every row a no-op after it - and neither shows what
  // the plan is for. Each step below is a real product event replayed in
  // order, not fabricated history: the sync runs against the recording fake
  // provider, so nothing reaches a person.
  //
  //   1. "Undo as a Contract" was CONFIRMED when invitations went out. The
  //      fixture stores it cancelled because that is where it ends up; the
  //      cancellation happened after the sync, which is why the plan has to
  //      cancel a provider event rather than never create one.
  const undo = await seneca.entity('cag/fixture').load$('demo_undo')
  if (undo) {
    undo.status = 'confirmed'
    await undo.save$()
  }

  for (const top of ['conf_tiny', 'demo_conf']) {
    const run = await seneca.post('sys:calendar,apply:sync',
      { fixture_id: top, confirm: true })
    if (run.ok && run.run_id) {
      await seneca.post('sys:calendar,drain:run', { run_id: run.run_id })
    }
  }

  //   2. Then it was cancelled. The link is active, so the next plan must
  //      cancel the event - and the hash is UNCHANGED, which is exactly the
  //      case a hash-first reconciliation would silently skip.
  if (undo) {
    const row = await seneca.entity('cag/fixture').load$('demo_undo')
    if (row) {
      row.status = 'cancelled'
      await row.save$()
    }
  }

  //   3. And a co-mentor joined the workshop. One more attendee is invisible
  //      in the grid but material to a calendar entry, so the next plan reads
  //      "attendee set".
  const mentor = await seneca.entity('cag/appearance').load$('da_workshop_mentor')
  if (null == mentor) {
    await seneca.entity('cag/appearance').data$({
      id$: 'da_workshop_mentor',
      org_id: 'org_demo', fixture_id: 'demo_workshop', speaker_id: 'ds_priya',
      role: 'mentor', invite: 'none', order: 2, owner_id: owner.id,
    }).save$()
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
