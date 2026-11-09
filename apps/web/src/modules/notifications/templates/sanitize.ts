/**
 * notifications/templates/sanitize.ts
 *
 * Sanitizer for buyer-controlled free text rendered into email bodies.
 * Strips control + bidi/invisible format chars, collapses whitespace, caps length.
 * HTML escaping is still done by React at render time.
 */
export const MAX_DISPLAY_NAME_LENGTH = 80

// C0/C1 controls, bidi overrides/isolates, zero-width + BOM, line/paragraph separators
const UNSAFE_CHARS = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]",
  "g",
)

export function sanitizeDisplayName(raw: string, max: number = MAX_DISPLAY_NAME_LENGTH): string {
  const cleaned = raw.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim()
  const chars = Array.from(cleaned)
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() + "…" : cleaned
}
