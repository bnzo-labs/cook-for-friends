import { describe, expect, it } from "vitest"

import { pickReminderOffset } from "../server/reminder-offsets"

const OFFSETS = [48, 24]

/** Hourly cron over the last 72 h before the start; seat booked long ago → which reminders fire. */
function simulate(bookedHoursBefore: number): number[] {
  const sent = new Set<number>()
  for (let h = 72; h > 0; h -= 1) {
    const o = pickReminderOffset(OFFSETS, h, bookedHoursBefore)
    if (o !== null) sent.add(o)
  }
  return [...sent].sort((a, b) => b - a)
}

describe("pickReminderOffset", () => {
  it("cron hourly across 72 h → exactly one 48 h and one 24 h window", () => {
    expect(simulate(500)).toEqual([48, 24])
  })

  it("booked 30 h before → only the 24 h reminder", () => {
    expect(simulate(30)).toEqual([24])
  })

  it("booked 10 h before → none", () => {
    expect(simulate(10)).toEqual([])
  })

  it("too early → none; in window → the smallest covering offset", () => {
    expect(pickReminderOffset(OFFSETS, 60, 500)).toBeNull()
    expect(pickReminderOffset(OFFSETS, 47.5, 500)).toBe(48)
    expect(pickReminderOffset(OFFSETS, 24, 500)).toBe(24)
    expect(pickReminderOffset(OFFSETS, 20, 500)).toBe(24) // missed 48 → only the current window
  })

  it("already started, or unusable offsets → none", () => {
    expect(pickReminderOffset(OFFSETS, 0, 500)).toBeNull()
    expect(pickReminderOffset(OFFSETS, -3, 500)).toBeNull()
    expect(pickReminderOffset([0, -1, 2.5], 10, 500)).toBeNull()
  })

  it("custom offsets and duplicates", () => {
    expect(pickReminderOffset([72, 48, 48, 2], 1.5, 500)).toBe(2)
    expect(pickReminderOffset([72, 48, 48, 2], 40, 500)).toBe(48)
  })
})
