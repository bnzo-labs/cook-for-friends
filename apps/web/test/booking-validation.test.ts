import { describe, expect, it } from "vitest"
import {
  buildCheckoutBody,
  clampQuantity,
  issuePathToFieldKey,
  validateBooking,
} from "../src/components/storefront/booking/booking-validation"

const guest = (n: number) => ({ firstName: `G${n}`, lastName: "X", email: `g${n}@example.com` })

describe("validateBooking", () => {
  it("N=1 needs nothing", () => {
    expect(validateBooking({ quantity: 1, buyerEmail: "", guests: [] })).toEqual({})
  })
  it("N=2 requires buyer email", () => {
    expect(validateBooking({ quantity: 2, buyerEmail: "", guests: [guest(1)] }).email).toEqual({
      kind: "local",
      code: "email_required",
    })
  })
  it("flags duplicate guest and buyer emails, case-insensitive", () => {
    const e = validateBooking({
      quantity: 3,
      buyerEmail: "Me@Example.com",
      guests: [{ ...guest(1), email: "me@example.com" }, { ...guest(2), email: "G1@example.com" }, guest(3)],
    })
    expect(e["guests.0.email"]).toEqual({ kind: "local", code: "email_duplicate" })
    expect(e["guests.1.email"]).toBeUndefined()
  })
  it("requires names, caps length, validates email shape", () => {
    const e = validateBooking({
      quantity: 2,
      buyerEmail: "a@b.co",
      guests: [{ firstName: " ", lastName: "x".repeat(101), email: "nope" }],
    })
    expect(e["guests.0.firstName"]).toEqual({ kind: "local", code: "required" })
    expect(e["guests.0.lastName"]).toEqual({ kind: "local", code: "too_long" })
    expect(e["guests.0.email"]).toEqual({ kind: "local", code: "email_invalid" })
  })
  it("ignores drafts beyond quantity - 1", () => {
    expect(validateBooking({ quantity: 1, buyerEmail: "", guests: [guest(1)] })).toEqual({})
  })
})

describe("buildCheckoutBody", () => {
  it("omits attendees and email at N=1", () => {
    expect(
      buildCheckoutBody({ courseId: 4, sessionId: 9, quantity: 1, buyerEmail: " ", guests: [guest(1)], locale: "fr" }),
    ).toEqual({ lines: [{ courseId: 4, sessionId: 9, quantity: 1 }], locale: "fr" })
  })
  it("sends N-1 trimmed attendees at N=3", () => {
    const body = buildCheckoutBody({
      courseId: 4, sessionId: 9, quantity: 3, buyerEmail: " me@x.co ", guests: [guest(1), guest(2), guest(3)], locale: "en",
    })
    expect(body.email).toBe("me@x.co")
    expect(body.lines[0]?.attendees).toEqual([guest(1), guest(2)])
  })
  it("online: no sessionId", () => {
    expect(
      buildCheckoutBody({ courseId: 1, sessionId: null, quantity: 1, buyerEmail: "", guests: [], locale: "en" }).lines[0],
    ).toEqual({ courseId: 1, quantity: 1 })
  })
})

describe("helpers", () => {
  it("maps issue paths", () => {
    expect(issuePathToFieldKey("lines.0.attendees.1.email")).toBe("guests.1.email")
    expect(issuePathToFieldKey("email")).toBe("email")
    expect(issuePathToFieldKey("lines.0.quantity")).toBeNull()
  })
  it("clamps quantity", () => {
    expect(clampQuantity(9, 4)).toBe(4)
    expect(clampQuantity(NaN, 4)).toBe(1)
    expect(clampQuantity(0, 4)).toBe(1)
    expect(clampQuantity(3, 0)).toBe(1)
  })
})
