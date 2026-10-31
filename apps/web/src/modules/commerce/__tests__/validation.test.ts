import { describe, expect, it } from "vitest"

import { checkLineRules, checkoutInputSchema, effectiveMaxSeats, isCartToken, MSG, zodIssues } from "../server/validation"

const guest = (i: number, email = `guest${i}@example.com`) => ({ firstName: `G${i}`, lastName: "Test", email })

function parse(body: unknown) {
  const r = checkoutInputSchema.safeParse(body)
  return r.success ? { ok: true as const, data: r.data } : { ok: false as const, issues: zodIssues(r.error) }
}

describe("checkoutInputSchema", () => {
  const base = { locale: "fr", lines: [{ courseId: 1, sessionId: 2, quantity: 1 }] }

  it("accepts one line; numeric-string ids become numbers", () => {
    const r = parse({ ...base, lines: [{ courseId: "12", sessionId: "7", quantity: 1 }] })
    expect(r.ok && r.data.lines[0]).toMatchObject({ courseId: 12, sessionId: 7 })
  })

  it("rejects two lines and zero lines", () => {
    const two = parse({ ...base, lines: [base.lines[0], base.lines[0]] })
    expect(two.ok).toBe(false)
    expect(!two.ok && two.issues).toContainEqual({ path: "lines", message: MSG.CART_SINGLE_LINE })
    expect(parse({ ...base, lines: [] }).ok).toBe(false)
  })

  it.each([0, -1, 11, 1.5, "2", null])("rejects quantity %s", (quantity) => {
    const r = parse({ ...base, lines: [{ courseId: 1, sessionId: 2, quantity }] })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues).toContainEqual({ path: "lines.0.quantity", message: MSG.QUANTITY_OUT_OF_RANGE })
  })

  it("rejects bad locale, bad ids, bad email", () => {
    expect(parse({ ...base, locale: "de" }).ok).toBe(false)
    expect(parse({ ...base, lines: [{ courseId: "abc", quantity: 1 }] }).ok).toBe(false)
    expect(parse({ ...base, lines: [{ courseId: 0, quantity: 1 }] }).ok).toBe(false)
    expect(parse({ ...base, email: "nope" }).ok).toBe(false)
  })

  it("trims names, trims + lower-cases emails; names 1..100", () => {
    const r = parse({
      ...base,
      email: "  Buyer@Example.COM ",
      lines: [{ courseId: 1, sessionId: 2, quantity: 2, attendees: [{ firstName: " Ann ", lastName: " Lee ", email: " ANN@Example.com " }] }],
    })
    expect(r.ok && r.data.email).toBe("buyer@example.com")
    expect(r.ok && r.data.lines[0]?.attendees?.[0]).toEqual({ firstName: "Ann", lastName: "Lee", email: "ann@example.com" })
    const long = parse({ ...base, lines: [{ courseId: 1, sessionId: 2, quantity: 2, attendees: [{ ...guest(1), firstName: "x".repeat(101) }] }] })
    expect(!long.ok && long.issues[0]?.path).toBe("lines.0.attendees.0.firstName")
    const blank = parse({ ...base, lines: [{ courseId: 1, sessionId: 2, quantity: 2, attendees: [{ ...guest(1), lastName: "   " }] }] })
    expect(!blank.ok && blank.issues[0]?.path).toBe("lines.0.attendees.0.lastName")
  })
})

describe("checkLineRules (D9)", () => {
  const rules = (line: Record<string, unknown>, email?: string, format: "in_person" | "online" = "in_person", max = 4) => {
    const r = checkoutInputSchema.safeParse({ locale: "fr", email, lines: [{ courseId: 1, ...line }] })
    if (!r.success) throw new Error(JSON.stringify(r.error.issues))
    return checkLineRules(r.data, format, max)
  }

  it("single seat, no email, no attendees → ok", () => {
    expect(rules({ sessionId: 2, quantity: 1 })).toEqual([])
  })

  it("3 seats with buyer email + 2 distinct guests → ok", () => {
    expect(rules({ sessionId: 2, quantity: 3, attendees: [guest(1), guest(2)] }, "buyer@example.com")).toEqual([])
  })

  it("quantity above the staff max is rejected (max 2 → 3 rejected, 2 ok)", () => {
    expect(rules({ sessionId: 2, quantity: 3, attendees: [guest(1), guest(2)] }, "b@example.com", "in_person", 2)).toEqual([
      { path: "lines.0.quantity", message: MSG.QUANTITY_OUT_OF_RANGE },
    ])
    expect(rules({ sessionId: 2, quantity: 2, attendees: [guest(1)] }, "b@example.com", "in_person", 2)).toEqual([])
  })

  it("N > 1 without buyer email → BUYER_EMAIL_REQUIRED", () => {
    expect(rules({ sessionId: 2, quantity: 2, attendees: [guest(1)] })).toContainEqual({
      path: "email",
      message: MSG.BUYER_EMAIL_REQUIRED,
    })
  })

  it("attendee count ≠ N − 1 → ATTENDEES_MISMATCH", () => {
    expect(rules({ sessionId: 2, quantity: 3, attendees: [guest(1)] }, "b@example.com")).toEqual([
      { path: "lines.0.attendees", message: MSG.ATTENDEES_MISMATCH },
    ])
    expect(rules({ sessionId: 2, quantity: 1, attendees: [guest(1)] })).toEqual([
      { path: "lines.0.attendees", message: MSG.ATTENDEES_MISMATCH },
    ])
  })

  it.each(["buyer@example.com", "BUYER@example.com", "  Buyer@Example.com  "])(
    "guest email = buyer email (%s) → duplicate at the guest's path",
    (dup) => {
      expect(rules({ sessionId: 2, quantity: 3, attendees: [guest(1), guest(2, dup)] }, "buyer@example.com")).toEqual([
        { path: "lines.0.attendees.1.email", message: MSG.ATTENDEE_EMAIL_DUPLICATE },
      ])
    },
  )

  it("duplicate guest emails → duplicate at the second guest", () => {
    expect(
      rules({ sessionId: 2, quantity: 3, attendees: [guest(1, "same@example.com"), guest(2, "SAME@example.com")] }, "b@example.com"),
    ).toEqual([{ path: "lines.0.attendees.1.email", message: MSG.ATTENDEE_EMAIL_DUPLICATE }])
  })

  it("in-person without session → SESSION_REQUIRED", () => {
    expect(rules({ quantity: 1 })).toEqual([{ path: "lines.0.sessionId", message: MSG.SESSION_REQUIRED }])
  })

  it("online: quantity must be 1, no session, no attendees", () => {
    expect(rules({ quantity: 1 }, undefined, "online")).toEqual([])
    expect(rules({ quantity: 2 }, "b@example.com", "online")).toEqual([
      { path: "lines.0.quantity", message: MSG.QUANTITY_OUT_OF_RANGE },
    ])
    expect(rules({ quantity: 1, sessionId: 3 }, undefined, "online")).toEqual([
      { path: "lines.0.sessionId", message: MSG.SESSION_NOT_ALLOWED },
    ])
    expect(rules({ quantity: 1, attendees: [guest(1)] }, undefined, "online")).toEqual([
      { path: "lines.0.attendees", message: MSG.ATTENDEES_MISMATCH },
    ])
  })
})

describe("helpers", () => {
  it("effectiveMaxSeats clamps to 1..10", () => {
    expect(effectiveMaxSeats(4)).toBe(4)
    expect(effectiveMaxSeats(25)).toBe(10)
    expect(effectiveMaxSeats(0)).toBe(1)
    expect(effectiveMaxSeats(Number.NaN)).toBe(1)
  })

  it("isCartToken accepts base64url 16..128", () => {
    expect(isCartToken("a".repeat(43))).toBe(true)
    expect(isCartToken("short")).toBe(false)
    expect(isCartToken("has space in the token!!")).toBe(false)
    expect(isCartToken(undefined)).toBe(false)
  })
})
