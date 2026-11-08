/**
 * notifications/server/ics.ts
 *
 * RFC 5545-compliant iCalendar (.ics) builder.
 *
 * Rules enforced:
 * - CRLF line endings
 * - METHOD:PUBLISH
 * - VTIMEZONE for America/Toronto (RRULE-based)
 * - DTSTART;TZID=America/Toronto in local wall-clock form
 * - DTSTAMP in UTC (Z suffix)
 * - Stable UID passed by caller
 * - Text escaping: \\ ; , \n
 * - Line folding at 75 **octets** (UTF-8 safe)
 */

const CRLF = "\r\n"

// ---------------------------------------------------------------------------
// VTIMEZONE — Eastern Time (America/Toronto)
// DST rules as of Energy Policy Act 2005:
//   Spring: 2nd Sunday in March   02:00 → 03:00  (DAYLIGHT, UTC-4)
//   Fall:   1st Sunday in November 02:00 → 01:00  (STANDARD, UTC-5)
// ---------------------------------------------------------------------------
const VTIMEZONE_EASTERN = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Toronto",
  "BEGIN:STANDARD",
  "DTSTART:19671029T020000",
  "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:20070311T020000",
  "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
].join(CRLF)

// ---------------------------------------------------------------------------
// Escaping — RFC 5545 §3.3.11
// ---------------------------------------------------------------------------
function escapeText(value: string): string {
  return (
    value
      // backslash first to avoid double-escaping
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n")
  )
}

// ---------------------------------------------------------------------------
// Line folding — RFC 5545 §3.1: fold at 75 octets (not chars)
// Continuation lines start with a single SPACE (1 octet).
// ---------------------------------------------------------------------------
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function foldLine(line: string): string {
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line

  const segments: string[] = []
  let offset = 0

  while (offset < bytes.length) {
    // First segment: 75 octets; subsequent (with leading space): 74 octets
    const maxOctets = segments.length === 0 ? 75 : 74
    let end = offset + maxOctets

    if (end >= bytes.length) {
      // Last chunk
      const leading = segments.length > 0 ? " " : ""
      segments.push(leading + decoder.decode(bytes.slice(offset)))
      break
    }

    // Back up from end to avoid splitting a multi-byte UTF-8 sequence.
    // UTF-8 continuation bytes start with 0b10xxxxxx (0x80–0xBF).
    while (end > offset && (bytes[end]! & 0xc0) === 0x80) {
      end--
    }
    // Back up past a leading byte that starts a sequence extending beyond the chunk.
    if (end > offset) {
      const lead = bytes[end - 1]!
      const seqLen = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1
      if (end - 1 + seqLen > offset + maxOctets) {
        end--
      }
    }

    const leading = segments.length > 0 ? " " : ""
    segments.push(leading + decoder.decode(bytes.slice(offset, end)))
    offset = end
  }

  return segments.join(CRLF)
}

// ---------------------------------------------------------------------------
// Date/time helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYYMMDDTHHMMSS in America/Toronto local time (no trailing Z). */
function toLocalDt(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  // hour12:false can return "24" at midnight; normalise to "00"
  const h = get("hour").replace("24", "00")
  return `${get("year")}${get("month")}${get("day")}T${h}${get("minute")}${get("second")}`
}

/** Format a Date as UTC YYYYMMDDTHHMMSSZ. */
function toDtStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildIcsInput {
  uid: string
  title: string
  description: string
  location: string
  startsAt: Date
  endsAt: Date
  url: string
}

/**
 * Build an RFC 5545-compliant iCalendar string for a single event.
 * Returns the full VCALENDAR block with CRLF line endings.
 */
export function buildIcs({
  uid,
  title,
  description,
  location,
  startsAt,
  endsAt,
  url,
}: BuildIcsInput): string {
  const dtStamp = toDtStamp(new Date())
  const dtStart = toLocalDt(startsAt)
  const dtEnd = toLocalDt(endsAt)

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cook for Friends//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    VTIMEZONE_EASTERN,
    "BEGIN:VEVENT",
    foldLine(`UID:${escapeText(uid)}`),
    foldLine(`DTSTAMP:${dtStamp}`),
    foldLine(`DTSTART;TZID=America/Toronto:${dtStart}`),
    foldLine(`DTEND;TZID=America/Toronto:${dtEnd}`),
    foldLine(`SUMMARY:${escapeText(title)}`),
    foldLine(`DESCRIPTION:${escapeText(description)}`),
    foldLine(`LOCATION:${escapeText(location)}`),
    foldLine(`URL:${url}`),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]

  return lines.join(CRLF) + CRLF
}
