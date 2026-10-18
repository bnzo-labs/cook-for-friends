const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const MAX_LENGTH = 512

/**
 * Accept only same-origin absolute paths ("/fr/account?x=1"). Anything else
 * (absolute URLs, protocol-relative "//host", backslash tricks, control chars)
 * returns null so callers fall back to the default destination.
 */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_LENGTH) return null
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null
  if (CONTROL_CHARS.test(next)) return null
  try {
    const base = "http://same-origin.invalid"
    const url = new URL(next, base)
    if (url.origin !== base) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
