/* What every validation rule is given. SPEC 16.
 *
 * Rules are PURE functions of this - no store, no bus. That is what makes
 * each one a self-contained unit with a triggering fixture and a
 * non-triggering near-miss (SPEC 18), and what SPEC 22 means by validation
 * rules delegating well.
 *
 * Effective status and privacy are already resolved along the ancestor chain
 * by concern:fixture. No rule walks the tree itself.
 */

import { Diagnostic, EntityRef } from './diagnostic'

export type Fixture = {
  id: string
  parent_id?: string | null
  kind?: string
  title?: string
  desc?: string
  slug?: string
  org_id?: string
  room_id?: string | null
  track_id?: string | null
  t_start?: number
  t_end?: number
  t_tzn?: string
  status?: string
  effective_status?: string
  effective_private?: boolean
  [k: string]: unknown
}

export type Row = { id: string; org_id?: string; [k: string]: unknown }

export type ValidateInput = {
  top: Fixture
  /** Every descendant of `top`, with effective values resolved. */
  segments: Fixture[]
  rooms: Row[]
  tracks: Row[]
  speakers: Row[]
  appearances: Row[]
}

export type Rule = (input: ValidateInput) => Diagnostic[]

/** Kind codes, and the tree shape they imply (SPEC 8.1). */
export const TOP_KINDS = ['con', 'web', 'mep', 'sem', 'gen']
export const GROUP_KINDS = ['day']
export const SEGMENT_KINDS = ['key', 'tak', 'lgt', 'wrk', 'pan', 'brk', 'mea', 'soc', 'reg']

/** Only talk-like segments generate calendar invitations (SPEC 8.1). */
export const TALK_KINDS = ['key', 'tak', 'lgt', 'wrk', 'pan']

export const ALL_KINDS = [...TOP_KINDS, ...GROUP_KINDS, ...SEGMENT_KINDS]

export const ref = (canon: string, id: string, label?: string): EntityRef => ({
  canon,
  id,
  label,
})

export const fixRef = (f: Fixture): EntityRef => ref('cag/fixture', f.id, f.title)

export const quoted = (f: Fixture) => '"' + (f.title ?? f.id) + '"'

/** A cancelled thing is not a scheduling problem. Most rules skip these. */
export const isLive = (f: Fixture) => 'cancelled' !== (f.effective_status ?? f.status)
