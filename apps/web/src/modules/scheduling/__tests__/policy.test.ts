import { describe, expect, it } from "vitest"

import { DEFAULT_TIERS, effectiveTiers, evaluateTiers } from "../server/policy"

const T = [...DEFAULT_TIERS]

describe("evaluateTiers (D1)", () => {
  it.each([
    [100, "refund", 100, 5000],
    [72, "refund", 100, 5000], // boundary: exactly 72 h is still the refund tier
    [71.999, "credit", 100, 5000],
    [48, "credit", 100, 5000],
    [24, "credit", 100, 5000], // boundary
    [23.999, "none", 0, 0],
    [10, "none", 0, 0],
    [0, "none", 0, 0],
    [-5, "none", 0, 0], // already started
  ])("%s h before → %s", (hours, outcome, percent, amount) => {
    expect(evaluateTiers(T, hours, 5000)).toMatchObject({ outcome, percent, amount })
  })

  it("empty tiers → none", () => {
    expect(evaluateTiers([], 500, 5000)).toEqual({ outcome: "none", percent: 0, amount: 0, tierMinHours: null })
  })

  it("percent rounds down to whole cents", () => {
    const tiers = [{ minHoursBefore: 0, outcome: "refund" as const, percent: 33 }]
    expect(evaluateTiers(tiers, 10, 9999).amount).toBe(3299) // floor(3299.67)
    expect(evaluateTiers(tiers, 10, 1).amount).toBe(0)
    expect(evaluateTiers(tiers, 10, 1).outcome).toBe("none") // worth nothing → none
  })

  it("unsorted tiers do not change the result", () => {
    const unsorted = [T[2]!, T[0]!, T[1]!]
    expect(evaluateTiers(unsorted, 100, 5000).outcome).toBe("refund")
    expect(evaluateTiers(unsorted, 30, 5000).outcome).toBe("credit")
    expect(evaluateTiers(unsorted, 1, 5000).outcome).toBe("none")
  })

  it("clamps percent into 0..100 and never mutates the input", () => {
    const tiers = Object.freeze([Object.freeze({ minHoursBefore: 0, outcome: "refund" as const, percent: 250 })])
    expect(evaluateTiers(tiers, 1, 1000).amount).toBe(1000)
  })

  it("reports the matched tier lower bound", () => {
    expect(evaluateTiers(T, 48, 5000).tierMinHours).toBe(24)
  })
})

describe("effectiveTiers", () => {
  it("falls back to the DISCOVERY D1 default when the global is empty", () => {
    expect(effectiveTiers([])).toBe(DEFAULT_TIERS)
    const custom = [{ minHoursBefore: 48, outcome: "refund" as const, percent: 50 }]
    expect(effectiveTiers(custom)).toBe(custom)
  })
})
