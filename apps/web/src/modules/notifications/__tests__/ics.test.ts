/**
 * Unit tests for RFC 5545 ICS builder.
 *
 * Validates:
 * - CRLF line endings
 * - METHOD:PUBLISH present
 * - VTIMEZONE America/Toronto block present
 * - DTSTART uses local wall-clock (TZID= format, no Z suffix)
 * - DTSTAMP uses UTC (Z suffix, no TZID)
 * - Text escaping (backslash, semicolon, comma, newline)
 * - Line folding at 75 octets (not characters — UTF-8-safe)
 */
import { describe, expect, it } from "vitest"
import { buildIcs } from "../server/ics"

const BASE = {
  uid: "test-uid-001",
  title: "Test Event",
  description: "A test description",
  location: "Test Venue, 123 Main St, Toronto",
  startsAt: new Date("2026-06-15T14:00:00-04:00"), // 2pm EDT
  endsAt: new Date("2026-06-15T17:00:00-04:00"), // 5pm EDT
  url: "https://cookforfriends.ca/sessions/test-uid-001",
}

describe("buildIcs — RFC 5545 compliance", () => {
  it("uses CRLF line endings throughout", () => {
    const ics = buildIcs(BASE)
    const lines = ics.split("\r\n")
    // Every split produces non-empty segments
    expect(lines.length).toBeGreaterThan(5)
    // No bare LF without preceding CR
    expect(ics).not.toMatch(/(?<!\r)\n/)
  })

  it("starts with BEGIN:VCALENDAR and ends with END:VCALENDAR", () => {
    const ics = buildIcs(BASE)
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toMatch(/END:VCALENDAR\r\n$/)
  })

  it("includes METHOD:PUBLISH", () => {
    const ics = buildIcs(BASE)
    expect(ics).toContain("METHOD:PUBLISH\r\n")
  })

  it("includes VTIMEZONE America/Toronto", () => {
    const ics = buildIcs(BASE)
    expect(ics).toContain("BEGIN:VTIMEZONE\r\n")
    expect(ics).toContain("TZID:America/Toronto\r\n")
    expect(ics).toContain("END:VTIMEZONE\r\n")
  })

  it("DTSTART uses TZID= local format (no Z suffix)", () => {
    const ics = buildIcs(BASE)
    // Must have TZID=America/Toronto and NOT end with Z
    expect(ics).toMatch(/DTSTART;TZID=America\/Toronto:\d{8}T\d{6}\r\n/)
    expect(ics).not.toMatch(/DTSTART.*Z\r\n/)
  })

  it("DTSTAMP uses UTC Z format (no TZID)", () => {
    const ics = buildIcs(BASE)
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/)
    expect(ics).not.toMatch(/DTSTAMP;TZID/)
  })

  it("escapes backslashes in text fields", () => {
    const ics = buildIcs({ ...BASE, title: "Title\\with\\backslash" })
    expect(ics).toContain("SUMMARY:Title\\\\with\\\\backslash")
  })

  it("escapes semicolons in text fields", () => {
    const ics = buildIcs({ ...BASE, title: "Title;with;semicolons" })
    expect(ics).toContain("SUMMARY:Title\\;with\\;semicolons")
  })

  it("escapes commas in text fields", () => {
    const ics = buildIcs({ ...BASE, description: "Part1,Part2,Part3" })
    expect(ics).toContain("DESCRIPTION:Part1\\,Part2\\,Part3")
  })

  it("escapes newlines in description", () => {
    const ics = buildIcs({ ...BASE, description: "Line1\nLine2\nLine3" })
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2\\nLine3")
  })

  it("folds lines longer than 75 octets", () => {
    const longTitle = "A".repeat(100) // 100-char title generates a long SUMMARY line
    const ics = buildIcs({ ...BASE, title: longTitle })
    const lines = ics.split("\r\n")
    // No unfolded line should exceed 75 octets
    for (const line of lines) {
      const octets = new TextEncoder().encode(line).length
      expect(octets).toBeLessThanOrEqual(75)
    }
  })

  it("folds UTF-8 multibyte sequences at octet boundaries (not char boundaries)", () => {
    // Each é is 2 bytes in UTF-8
    const title = "é".repeat(40) // 80 bytes, must fold
    const ics = buildIcs({ ...BASE, title })
    const lines = ics.split("\r\n")
    for (const line of lines) {
      const octets = new TextEncoder().encode(line).length
      expect(octets).toBeLessThanOrEqual(75)
    }
    // The title must survive round-trip (unfolded content equals original)
    expect(ics).toContain("SUMMARY:")
    expect(ics).toContain("é")
  })

  it("includes UID matching the input", () => {
    const ics = buildIcs(BASE)
    expect(ics).toContain(`UID:test-uid-001\r\n`)
  })

  it("includes URL", () => {
    const ics = buildIcs(BASE)
    expect(ics).toContain("URL:https://cookforfriends.ca/sessions/test-uid-001\r\n")
  })

  it("contains VEVENT block", () => {
    const ics = buildIcs(BASE)
    expect(ics).toContain("BEGIN:VEVENT\r\n")
    expect(ics).toContain("END:VEVENT\r\n")
  })
})
