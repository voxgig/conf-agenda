import { describe, test } from 'node:test'
import assert from 'node:assert'

const { buildAgenda, isPublishable, SCHEMA_VERSION } = require('../../dist/lib/agenda.js')

const T = (h: number, m = 0) => 1825200000000 + h * 3600000 + m * 60000

// A fixture containing EVERY thing that must not reach public output
// (SPEC 18: "fuzz the resolver against a test fixture containing all of these").
function loaded() {
  const top = {
    id: 'conf', slug: 'c27', title: 'Conf 27', t_tzn: 'Europe/Dublin',
    t_start: T(8), t_end: T(18), effective_status: 'confirmed', effective_private: false,
  }
  const segments = [
    // published, ordinary
    { id: 's_ok', parent_id: 'conf', kind: 'tak', title: 'Public Talk', room_id: 'r1',
      track_id: 't1', t_start: T(9), t_end: T(10),
      effective_status: 'confirmed', effective_private: false },

    // cancelled - MUST appear, marked cancelled (SPEC 9.1)
    { id: 's_cancelled', parent_id: 'conf', kind: 'tak', title: 'Cancelled Talk', room_id: 'r1',
      t_start: T(10), t_end: T(11),
      effective_status: 'cancelled', effective_private: false },

    // draft - must NOT appear
    { id: 's_draft', parent_id: 'conf', kind: 'tak', title: 'SECRETDRAFT', room_id: 'r1',
      t_start: T(11), t_end: T(12),
      effective_status: 'draft', effective_private: false },

    // private - must NOT appear
    { id: 's_private', parent_id: 'conf', kind: 'tak', title: 'SECRETPRIVATE', room_id: 'r2',
      t_start: T(12), t_end: T(13),
      effective_status: 'confirmed', effective_private: true },

    // THE ANCESTOR CASE: confirmed on its own row, but effectively draft
    // because its day is unfinished. This is the leak SPEC 9.1 names.
    { id: 's_under_draft_day', parent_id: 'day_draft', kind: 'tak', title: 'SECRETANCESTOR',
      room_id: 'r2', t_start: T(14), t_end: T(15),
      effective_status: 'draft', effective_private: false },

    // a grouping fixture - resolved away, never a session
    { id: 'day_draft', parent_id: 'conf', kind: 'day', title: 'Draft Day',
      effective_status: 'draft', effective_private: false },
  ]
  const rooms = [
    { id: 'r1', name: 'Room One', capacity: 100, order: 1 },
    { id: 'r2', name: 'Room Two', capacity: 50, order: 2 },
    { id: 'r_unused', name: 'Unused', order: 3 },
  ]
  const tracks = [{ id: 't1', name: 'Track One', color: '#e70042', order: 1 }]
  const speakers = [
    { id: 'sp_public', name: 'Published Person', email: 'public@secret.invalid', bio: 'Bio.' },
    { id: 'sp_hidden', name: 'Draft Only', email: 'hidden@secret.invalid' },
  ]
  const appearances = [
    { id: 'a1', fixture_id: 's_ok', speaker_id: 'sp_public' },
    { id: 'a2', fixture_id: 's_draft', speaker_id: 'sp_hidden' },
    { id: 'a3', fixture_id: 's_under_draft_day', speaker_id: 'sp_hidden' },
  ]
  return { top, segments, rooms, tracks, speakers, appearances }
}

describe('agenda snapshot: structural exclusion', () => {
  test('nothing private reaches the payload - scanned, not inspected field by field', () => {
    const json = JSON.stringify(buildAgenda(loaded()))

    // A whole-document scan. If a future field carries any of these through,
    // this fails regardless of which key it arrived under - which a per-field
    // assertion would not.
    for (const forbidden of [
      'secret.invalid',   // any speaker email
      '@',                // any address at all
      'SECRETDRAFT',
      'SECRETPRIVATE',
      'SECRETANCESTOR',
    ]) {
      assert.ok(
        !json.includes(forbidden),
        `"${forbidden}" reached agenda.json: ${json.slice(0, 300)}`,
      )
    }
  })

  test('the ancestor case specifically: confirmed talk under a draft day stays out', () => {
    const agenda: any = buildAgenda(loaded())
    const ids = agenda.sessions.map((s: any) => s.id)
    assert.ok(!ids.includes('s_under_draft_day'), 'its own status said confirmed')
    assert.ok(!ids.includes('day_draft'), 'a grouping fixture is never a session')
  })

  test('a speaker with no published session never appears', () => {
    const agenda: any = buildAgenda(loaded())
    const ids = agenda.speakers.map((s: any) => s.id)
    assert.deepEqual(ids, ['sp_public'])
  })

  test('speaker records carry no email key at all', () => {
    const agenda: any = buildAgenda(loaded())
    for (const s of agenda.speakers) {
      assert.ok(!('email' in s), 'not filtered out - never picked up (C6)')
    }
  })

  test('cancelled sessions ARE published, marked cancelled', () => {
    const agenda: any = buildAgenda(loaded())
    const cancelled = agenda.sessions.find((s: any) => 's_cancelled' === s.id)
    assert.ok(cancelled, 'a vanished session looks like a bug to an attendee')
    assert.equal(cancelled.status, 'cancelled')
  })

  test('only referenced rooms and tracks appear', () => {
    const agenda: any = buildAgenda(loaded())
    assert.deepEqual(agenda.rooms.map((r: any) => r.id), ['r1'])
    assert.deepEqual(agenda.tracks.map((t: any) => t.id), ['t1'])
  })

  test('isPublishable: confirmed and cancelled yes, draft and private no', () => {
    assert.equal(isPublishable({ id: 'x', effective_status: 'confirmed' }), true)
    assert.equal(isPublishable({ id: 'x', effective_status: 'cancelled' }), true)
    assert.equal(isPublishable({ id: 'x', effective_status: 'draft' }), false)
    assert.equal(
      isPublishable({ id: 'x', effective_status: 'confirmed', effective_private: true }),
      false,
    )
  })
})

describe('agenda snapshot: determinism (SPEC 17)', () => {
  test('identical input gives byte-identical output', () => {
    const a = JSON.stringify(buildAgenda(loaded()))
    const b = JSON.stringify(buildAgenda(loaded()))
    assert.equal(a, b)
  })

  test('input order does not change the bytes', () => {
    const one = loaded()
    const two = loaded()
    two.segments.reverse()
    two.speakers.reverse()
    two.rooms.reverse()
    two.appearances.reverse()
    assert.equal(JSON.stringify(buildAgenda(one)), JSON.stringify(buildAgenda(two)))
  })

  test('carries a schema version and no publish timestamp', () => {
    const agenda: any = buildAgenda(loaded())
    assert.equal(agenda.schemaVersion, SCHEMA_VERSION)
    // A timestamp inside the payload would change the bytes on every publish
    // and make "what changed since we published" unanswerable.
    assert.ok(!JSON.stringify(agenda).includes('published_at'))
  })
})
