import { describe, expect, it } from "vitest"

import { profilePatchSchema } from "../server/profile"

const issues = (input: unknown) => {
  const r = profilePatchSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."))
}

describe("profilePatchSchema", () => {
  it("accepts a partial patch and normalizes blanks to null", () => {
    const r = profilePatchSchema.parse({ firstName: " Ada ", phone: "  ", dietaryNotes: "" })
    expect(r).toEqual({ firstName: "Ada", phone: null, dietaryNotes: null })
  })

  it("enforces length caps and locale", () => {
    expect(issues({ firstName: "x".repeat(101) })).toEqual(["firstName"])
    expect(issues({ lastName: "x".repeat(101) })).toEqual(["lastName"])
    expect(issues({ phone: "1".repeat(31) })).toEqual(["phone"])
    expect(issues({ dietaryNotes: "x".repeat(501) })).toEqual(["dietaryNotes"])
    expect(issues({ preferredLocale: "de" })).toEqual(["preferredLocale"])
    expect(issues({ marketingConsent: "yes" })).toEqual(["marketingConsent"])
  })

  it("accepts boundary values", () => {
    expect(issues({ firstName: "x".repeat(100), phone: "1".repeat(30), dietaryNotes: "x".repeat(500) })).toEqual([])
  })

  it("rejects immutable / unknown keys", () => {
    expect(issues({ email: "x@example.com" }).length).toBe(1)
    expect(issues({ sessionVersion: 9 }).length).toBe(1)
    expect(issues({ stripeCustomerId: "cus_1" }).length).toBe(1)
  })
})
