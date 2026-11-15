import { describe, expect, it } from "vitest"

import { Courses } from "../collections/courses"
import { Sessions } from "../collections/sessions"
import { applyDollarMirror, dollarsField, dollarsToCents, validateDollars } from "../fields/money"

describe("W4-07 catalog money in dollars (stored in cents)", () => {
  it("dollarsToCents: exact cents, no float drift; invalid → NaN; empty → null", () => {
    expect(dollarsToCents(45)).toBe(4500)
    expect(dollarsToCents(45.5)).toBe(4550)
    expect(dollarsToCents(19.99)).toBe(1999)
    expect(dollarsToCents(0.29)).toBe(29)
    expect(dollarsToCents(1234.56)).toBe(123456)
    expect(dollarsToCents(null)).toBeNull()
    expect(dollarsToCents(undefined)).toBeNull()
    expect(dollarsToCents(1.234)).toBeNaN()
    expect(dollarsToCents(-1)).toBeNaN()
    expect(dollarsToCents("45")).toBeNaN()
  })

  it("validateDollars: ≥ 0, at most 2 decimals, bounded; required only when the cents value is missing too", () => {
    expect(validateDollars(45.5, { siblingData: {} })).toBe(true)
    expect(validateDollars(0, { siblingData: {} })).toBe(true)
    expect(validateDollars(1.234, { siblingData: {} })).toBeTypeOf("string")
    expect(validateDollars(-2, { siblingData: {} })).toBeTypeOf("string")
    expect(validateDollars(200_000, { siblingData: {} })).toBeTypeOf("string")
    expect(validateDollars(null, { siblingData: { price: 4500 } }, { required: true, cents: "price" })).toBe(true)
    expect(validateDollars(null, { siblingData: {} }, { required: true, cents: "price" })).toBeTypeOf("string")
  })

  it("applyDollarMirror: admin edit of dollars wins; API edit of cents with a stale dollars value keeps cents; immutable", () => {
    const original = { price: 4500 }
    const adminEdit = { price: 4500, priceDollars: 52.5 }
    const out = applyDollarMirror(adminEdit, original, [["priceDollars", "price"]])
    expect(out).toEqual({ price: 5250 })
    expect(adminEdit).toEqual({ price: 4500, priceDollars: 52.5 })

    expect(applyDollarMirror({ price: 6000, priceDollars: 45 }, original, [["priceDollars", "price"]])).toEqual({ price: 6000 })
    expect(applyDollarMirror({ title: "x" }, original, [["priceDollars", "price"]])).toEqual({ title: "x" })
    expect(applyDollarMirror({ priceDollars: 30 }, undefined, [["priceDollars", "price"]])).toEqual({ price: 3000 })
    // invalid dollars are kept as-is in cents so cents validation rejects the save
    expect(applyDollarMirror({ priceDollars: 1.234 }, original, [["priceDollars", "price"]])).toEqual({ price: 1.234 })
  })

  it("dollarsField is virtual, step 0.01, reads cents / 100", async () => {
    const f = dollarsField({ name: "priceDollars", cents: "price", label: { fr: "Prix ($)", en: "Price ($)" } })
    expect(f.virtual).toBe(true)
    expect(f.admin?.step).toBe(0.01)
    const read = f.hooks?.afterRead?.[0] as (a: { siblingData: Record<string, unknown> }) => unknown
    expect(read({ siblingData: { price: 4550 } })).toBe(45.5)
    expect(read({ siblingData: {} })).toBeNull()
  })

  it("courses: price entered in dollars (cents hidden), FR labels on Stripe sync fields", () => {
    const byName = new Map(Courses.fields.filter((f) => "name" in f).map((f) => [(f as { name: string }).name, f as Record<string, any>]))
    expect(byName.get("price")?.admin?.hidden).toBe(true)
    expect(byName.get("priceDollars")?.virtual).toBe(true)
    for (const n of ["stripeProductId", "stripePriceId", "stripeSyncStatus", "stripeSyncError", "slug"]) {
      expect(byName.get(n)?.label?.fr, n).toBeTruthy()
    }
    expect(Courses.hooks?.beforeValidate?.length).toBeGreaterThan(0)
  })

  it("sessions: Lieu sub-fields labelled FR; status explains the cancel consequence", () => {
    const loc = Sessions.fields.find((f) => "name" in f && f.name === "location") as { fields: { name: string; label?: { fr: string } }[] }
    for (const sub of loc.fields) expect(sub.label?.fr, sub.name).toBeTruthy()
    const status = Sessions.fields.find((f) => "name" in f && f.name === "status") as { admin?: { description?: { fr: string } } }
    expect(status.admin?.description?.fr).toMatch(/rembours/i)
  })
})
