import { describe, expect, it } from "vitest"

import { attendanceOpen } from "./attendance-open"

describe("attendanceOpen (America/Toronto day)", () => {
  const start = "2026-12-05T23:30:00.000Z" // 18:30 Toronto, 5 Dec
  it("closed the day before, open on the day (even before start time), open after", () => {
    expect(attendanceOpen(start, new Date("2026-12-05T04:00:00.000Z"))).toBe(false) // 23:00 Toronto, 4 Dec
    expect(attendanceOpen(start, new Date("2026-12-05T05:30:00.000Z"))).toBe(true) // 00:30 Toronto, 5 Dec
    expect(attendanceOpen(start, new Date("2026-12-07T12:00:00.000Z"))).toBe(true)
  })
  it("a late-evening UTC start belongs to the Toronto calendar day", () => {
    expect(attendanceOpen("2026-12-06T02:00:00.000Z", new Date("2026-12-05T20:00:00.000Z"))).toBe(true) // both 5 Dec Toronto
  })
  it("no session date → closed", () => {
    expect(attendanceOpen(null)).toBe(false)
  })
})
