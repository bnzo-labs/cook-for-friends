import type { Field } from "payload"
import { describe, expect, it } from "vitest"

import { DiscountCodes } from "../collections/discount-codes"
import { Enrollments } from "../collections/enrollments"
import { Orders } from "../collections/orders"
import { applyDollarMirror } from "../money"

type Named = Field & { name: string; label?: { fr?: string }; fields?: Field[]; admin?: Record<string, any>; virtual?: boolean }
const named = (fields: Field[]) => fields.filter((f): f is Named => "name" in f)

/** Every named field (recursively) carries a localized FR label. */
function unlabelled(fields: Field[], prefix = ""): string[] {
  return named(fields).flatMap((f) => {
    const here = f.label && typeof f.label === "object" && f.label.fr ? [] : [`${prefix}${f.name}`]
    return [...here, ...(f.fields ? unlabelled(f.fields, `${prefix}${f.name}.`) : [])]
  })
}

describe("W4-07 commerce admin: FR labels, dollars", () => {
  it("discount-codes, orders, enrollments: every field has a FR label", () => {
    expect(unlabelled(DiscountCodes.fields)).toEqual([])
    expect(unlabelled(Orders.fields)).toEqual([])
    expect(unlabelled(Enrollments.fields)).toEqual([])
  })

  it("discount amount entered in dollars when kind = amount; percent stays an integer", () => {
    const f = new Map(named(DiscountCodes.fields).map((x) => [x.name, x]))
    expect(f.get("amountDollars")?.virtual).toBe(true)
    const showDollars = f.get("amountDollars")?.admin?.condition as (d: unknown, s: { kind?: string }) => boolean
    const showValue = f.get("value")?.admin?.condition as (d: unknown, s: { kind?: string }) => boolean
    expect(showDollars({}, { kind: "amount" })).toBe(true)
    expect(showDollars({}, { kind: "percent" })).toBe(false)
    expect(showValue({}, { kind: "percent" })).toBe(true)
    expect(showValue({}, { kind: "amount" })).toBe(false)
    expect(DiscountCodes.hooks?.beforeValidate?.length).toBeGreaterThan(0)
  })

  it("discount beforeValidate: dollars → cents only for kind amount", async () => {
    const hook = DiscountCodes.hooks!.beforeValidate![0]! as (a: { data: Record<string, unknown>; originalDoc?: Record<string, unknown> }) => unknown
    expect(await hook({ data: { kind: "amount", amountDollars: 12.5 } })).toEqual({ kind: "amount", value: 1250 })
    expect(await hook({ data: { kind: "percent", value: 20, amountDollars: 0.2 }, originalDoc: { kind: "percent", value: 20 } })).toEqual({
      kind: "percent",
      value: 20,
    })
  })

  it("order and seat money is shown read-only in dollars", () => {
    const o = new Map(named(Orders.fields).map((x) => [x.name, x]))
    for (const n of ["subtotal", "discountTotal", "taxGst", "taxQst", "total"]) {
      expect(o.get(n)?.admin?.readOnly, n).toBe(true)
      expect(o.get(n)?.admin?.components?.Field, n).toBe("/modules/commerce/admin/MoneyDisplay#MoneyDisplay")
    }
    const e = new Map(named(Enrollments.fields).map((x) => [x.name, x]))
    expect(e.get("seatAmount")?.admin?.components?.Field).toBe("/modules/commerce/admin/MoneyDisplay#MoneyDisplay")
  })

  it("applyDollarMirror (commerce copy) matches catalog semantics", () => {
    expect(applyDollarMirror({ value: 500, amountDollars: 7 }, { value: 500 }, [["amountDollars", "value"]])).toEqual({ value: 700 })
  })
})
