const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const MAX_LENGTH = 512

/**
 * Accept only same-origin absolute paths ("/fr/account?x=1"). Anything else
 * (absolute URLs, protocol-relative "//host", backslash tricks, control chars)
 * returns null so callers fall back to the default destination.
 */
const BASE = "http://same-origin.invalid"

function isSafeShape(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !CONTROL_CHARS.test(path)
}

function normalise(path: string): string | null {
  try {
    const url = new URL(path, BASE)
    if (url.origin !== BASE) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/**
 * W4-03b (W3-10 L-1): idempotent. URL normalisation can CREATE a "//" prefix
 * ("/.//evil.com" → "//evil.com"), so the normalised result is checked again
 * and must be a fixed point: `sanitizeNext(sanitizeNext(x)) === sanitizeNext(x)`.
 */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_LENGTH) return null
  if (!isSafeShape(next)) return null
  const out = normalise(next)
  if (out === null || !isSafeShape(out)) return null
  return normalise(out) === out ? out : null
}
