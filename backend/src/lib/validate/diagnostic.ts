/* The diagnostic structure every validation rule emits. SPEC 16.3.
 *
 * One structure renders in the app, the CLI and the API - so it carries a
 * stable machine-readable `rule` id AND a human-readable `message` and `fix`,
 * rather than prose that a UI has to parse.
 */

export type Severity = 'error' | 'warn'

/** A pointer to one entity, enough for a renderer to link to it. */
export type EntityRef = {
  canon: string
  id: string
  /** Human label - a title or name. For display only; never matched on. */
  label?: string
}

export type Diagnostic = {
  /** Stable id, e.g. 'room-double-booked'. Never localised, never renamed. */
  rule: string
  severity: Severity
  /** One line, no trailing newline. */
  message: string
  /** The entity the diagnostic is anchored to. */
  entity: EntityRef
  /**
   * Every entity involved. For a clash this names BOTH sides (SPEC 16.3), so a
   * renderer can highlight both without having to know which one `entity` is.
   */
  related: EntityRef[]
  /** What the organiser should do about it. */
  fix: string
  /** Rule-specific structured extras. Instants stay as epoch ms - a renderer
   *  formats wall time, because only it knows the zone (SPEC 8.3: one module
   *  converts, nothing else imports a date library). */
  data?: Record<string, unknown>
}

const refKey = (r: EntityRef) => r.canon + '/' + r.id

/**
 * Deterministic order (SPEC 16.3, and SPEC 17: identical input, identical
 * output). Severity first (errors before warnings), then rule, then the anchor
 * entity, then the related set - so two runs over the same data produce
 * byte-identical diagnostics, and the blocking problems are read first.
 */
export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  const sevRank = (s: Severity) => ('error' === s ? 0 : 1)
  return list.slice().sort((a, b) => {
    // SEVERITY FIRST: errors block publication, so they are what the organiser
    // must deal with. A report that buries the blocking error under warnings
    // is a report nobody reads to the end.
    if (a.severity !== b.severity) return sevRank(a.severity) - sevRank(b.severity)
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1
    const ae = refKey(a.entity)
    const be = refKey(b.entity)
    if (ae !== be) return ae < be ? -1 : 1
    const ar = a.related.map(refKey).join(',')
    const br = b.related.map(refKey).join(',')
    return ar === br ? 0 : ar < br ? -1 : 1
  })
}
