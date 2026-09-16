/* ONE redactor, used by every writer. SPEC C7.
 *
 * "Redaction at the sink - one redactor used by every writer, so an error
 * object cannot leak a token through a stack trace."
 *
 * The threat is not a developer deliberately logging a secret. It is a provider
 * SDK throwing an error whose message embeds the request it failed on, that
 * error being stringified into `last_error`, and `last_error` then appearing in
 * a console, a log aggregator and a support ticket. The value never passed
 * through anybody's own code.
 *
 * So this is applied at the SINK - wherever a string is about to be stored or
 * logged - and not at the call sites where a token is handled. Sinks are
 * countable; call sites are not.
 */

/** Keys whose VALUE is secret wherever it appears. */
const SECRET_KEY = /(token|secret|password|passwd|authorization|auth|api[_-]?key|client[_-]?secret|refresh|bearer|credential)/i

/** Shapes that are secret on sight, whatever they are called. */
const SECRET_SHAPE: RegExp[] = [
  // Bearer <token>
  /\bbearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  // Google/Microsoft OAuth grants and refresh tokens
  /\bya29\.[A-Za-z0-9._-]{10,}/g,
  /\b1\/\/[A-Za-z0-9._-]{10,}/g,
  // JWTs
  /\beyJ[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{5,}\.[A-Za-z0-9._-]{5,}/g,
  // key=value / "key": "value" for any secret-ish key
  /((?:token|secret|password|passwd|authorization|auth|api[_-]?key|client[_-]?secret|refresh|bearer|credential)["']?\s*[:=]\s*["']?)([^\s"',;&}]{4,})/gi,
]

export const REDACTED = '[redacted]'

/** Scrub a string. Safe to apply twice: the marker matches nothing. */
export function redactText(input: string): string {
  let out = String(input)
  for (const re of SECRET_SHAPE) {
    out = out.replace(re, (m, p1) => (null == p1 ? REDACTED : p1 + REDACTED))
  }
  return out
}

/**
 * Scrub any value on its way to a sink. Objects are walked so an error's
 * `cause`, `response` or `config` cannot smuggle a token through; keys whose
 * NAME is secret lose their value outright, whatever it looks like.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (null == value) return value
  if ('string' === typeof value) return redactText(value)
  if ('number' === typeof value || 'boolean' === typeof value) return value

  // Bounded: a cyclic or enormous error object must not hang the sink it is
  // being written to.
  if (6 < depth) return REDACTED

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      // NOT the stack. A stack is the most common way a request body - and the
      // header it carried - reaches a log.
    }
  }

  if ('object' === typeof value) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? REDACTED : redact(v, depth + 1)
    }
    return out
  }

  return REDACTED
}

/** The form a sink usually wants: a single scrubbed line. */
export function redactReason(value: unknown): string {
  if ('string' === typeof value) return redactText(value)
  if (value instanceof Error) return redactText(value.message)
  try {
    return redactText(JSON.stringify(redact(value)))
  }
  catch (e) {
    return REDACTED
  }
}
