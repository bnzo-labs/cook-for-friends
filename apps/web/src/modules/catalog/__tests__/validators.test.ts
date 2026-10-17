import { describe, expect, it } from "vitest"

import { formatCents } from "../admin/MoneyCell"
import { validateEndsAfterStart } from "../collections/sessions"
import { moneyField, validateCents, validateInteger } from "../fields/money"
import { validateTiers } from "../globals/cancellation-policy"
import { validateReminderOffsets } from "../globals/site-settings"

describe("catalog validators", () => {
  it("validateCents accepts integers ≥ 0 only", () => {
    expect(validateCents(0)).toBe(true)
    expect(validateCents(4500)).toBe(true)
    expect(validateCents(null)).toBe(true)
    expect(validateCents(undefined)).toBe(true)
    expect(validateCents(10.5)).toBeTypeOf("string")
    expect(validateCents(-1)).toBeTypeOf("string")
    expect(validateCents("100")).toBeTypeOf("string")
  })

  it("validateInteger enforces min", () => {
    const v = validateInteger(1)
    expect(v(1)).toBe(true)
    expect(v(undefined)).toBe(true)
    expect(v(0)).toBeTypeOf("string")
    expect(v(1.2)).toBeTypeOf("string")
  })

  it("moneyField is an integer cents number field with a $ cell", () => {
    const f = moneyField({ name: "price", required: true })
    expect(f.type).toBe("number")
    expect(f.min).toBe(0)
    expect(f.admin?.components?.Cell).toBe("/modules/catalog/admin/MoneyCell#MoneyCell")
    expect(typeof f.validate).toBe("function")
  })

  it("formatCents renders CAD", () => {
    expect(formatCents(4500, "en-CA")).toBe("$45.00")
    expect(formatCents("x")).toBe("—")
  })

  it("validateTiers requires strictly descending hours", () => {
    expect(validateTiers(undefined)).toBe(true)
    expect(validateTiers([{ minHoursBefore: 72 }, { minHoursBefore: 24 }, { minHoursBefore: 0 }])).toBe(true)
    expect(validateTiers([{ minHoursBefore: 24 }, { minHoursBefore: 72 }])).toBeTypeOf("string")
    expect(validateTiers([{ minHoursBefore: 24 }, { minHoursBefore: 24 }])).toBeTypeOf("string")
    expect(validateTiers([{ minHoursBefore: undefined }])).toBe(true)
    expect(validateTiers("x")).toBeTypeOf("string")
  })

  it("validateReminderOffsets requires positive integers", () => {
    expect(validateReminderOffsets([48, 24])).toBe(true)
    expect(validateReminderOffsets(null)).toBe(true)
    expect(validateReminderOffsets([0])).toBeTypeOf("string")
    expect(validateReminderOffsets([1.5])).toBeTypeOf("string")
    expect(validateReminderOffsets(5)).toBeTypeOf("string")
  })

  it("validateEndsAfterStart", () => {
    const startsAt = "2026-11-01T14:00:00.000Z"
    expect(validateEndsAfterStart("2026-11-01T17:00:00.000Z", { siblingData: { startsAt } })).toBe(true)
    expect(validateEndsAfterStart("2026-11-01T13:00:00.000Z", { siblingData: { startsAt } })).toBeTypeOf("string")
    expect(validateEndsAfterStart(undefined, { siblingData: { startsAt } })).toBe(true)
  })
})
