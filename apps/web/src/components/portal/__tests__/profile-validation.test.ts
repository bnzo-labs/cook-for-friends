import { describe, expect, it } from "vitest"

import { parseProfileForm } from "../profile-validation"
import { greetingName, safeExternalUrl } from "../format"

const form = (entries: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

describe("parseProfileForm", () => {
  it("marketing consent is false unless the box is ticked (Law 25)", () => {
    const r = parseProfileForm(form({ preferredLocale: "fr" }))
    expect(r.ok && r.value.marketingConsent).toBe(false)
    const on = parseProfileForm(form({ preferredLocale: "fr", marketingConsent: "on" }))
    expect(on.ok && on.value.marketingConsent).toBe(true)
  })
  it("trims, nulls blanks, accepts a normal phone", () => {
    const r = parseProfileForm(form({ firstName: " Ada ", lastName: "", phone: " +1 (514) 555-0100 ", dietaryNotes: " ", preferredLocale: "en" }))
    expect(r).toEqual({
      ok: true,
      value: { firstName: "Ada", lastName: "", phone: "+1 (514) 555-0100", dietaryNotes: null, preferredLocale: "en", marketingConsent: false },
    })
  })
  it("returns per-field errors", () => {
    const r = parseProfileForm(form({ firstName: "x".repeat(101), phone: "call me", dietaryNotes: "y".repeat(501), preferredLocale: "de" }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual({
      firstName: { code: "too_long", max: 100 },
      phone: { code: "phone_invalid" },
      dietaryNotes: { code: "too_long", max: 500 },
      preferredLocale: { code: "invalid" },
    })
  })
})

describe("portal format helpers", () => {
  it("community URL: https/http only, blank → null", () => {
    expect(safeExternalUrl("https://chat.example.com/x")).toBe("https://chat.example.com/x")
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull()
    expect(safeExternalUrl("  ")).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl("not a url")).toBeNull()
  })
  it("greetingName", () => {
    expect(greetingName(" Ada ")).toBe("Ada")
    expect(greetingName("  ")).toBeNull()
    expect(greetingName(null)).toBeNull()
  })
})
