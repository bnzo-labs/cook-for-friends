import { ValidationError } from "payload"
import { describe, expect, it } from "vitest"

import { CREDIT_CODE_PATTERN, generateCreditCode, isCodeConflict } from "../credit"
import { executeSeatCancellation, seatRefundKey } from "../cancel"
import { refundedForEnrollment } from "../shared"

describe("credit code (unit)", () => {
  it("CFF-CR- + 8 Crockford chars, no I L O U", () => {
    for (let n = 0; n < 500; n += 1) {
      const c = generateCreditCode()
      expect(c).toMatch(CREDIT_CODE_PATTERN)
      expect(c.slice(7)).not.toMatch(/[ILOU]/)
    }
  })
  it("codes are not repeated across a sample", () => {
    const s = new Set(Array.from({ length: 2000 }, generateCreditCode))
    expect(s.size).toBe(2000)
  })
  it("isCodeConflict: raw 23505, wrapped cause, ValidationError on `code` path; not other paths/errors", () => {
    expect(isCodeConflict({ code: "23505", constraint: "discount_codes_code_idx" })).toBe(true)
    expect(isCodeConflict(Object.assign(new Error("x"), { cause: { code: "23505" } }))).toBe(true)
    const ve = (path: string) => new ValidationError({ collection: "discount-codes", errors: [{ message: "Valeur déjà utilisée", path }] })
    expect(isCodeConflict(ve("code"))).toBe(true)
    expect(isCodeConflict(ve("value"))).toBe(false)
    expect(isCodeConflict(new Error("boom"))).toBe(false)
    expect(isCodeConflict(null)).toBe(false)
  })
})

describe("seat helpers (unit)", () => {
  it("refundedForEnrollment sums only that seat's linked refunds", () => {
    const order = {
      refunds: [
        { stripeRefundId: "re_1", amount: 1000, at: "", enrollment: 7 },
        { stripeRefundId: "re_2", amount: 500, at: "", enrollment: { id: 7 } },
        { stripeRefundId: "re_3", amount: 900, at: "", enrollment: 8 },
        { stripeRefundId: "re_4", amount: 300, at: "", enrollment: null },
      ],
    } as never
    expect(refundedForEnrollment(order, 7)).toBe(1500)
    expect(refundedForEnrollment(order, 9)).toBe(0)
  })
  it("refund idempotency key is per seat", () => expect(seatRefundKey(42)).toBe("seat-cancel-42"))
})

describe("executeSeatCancellation input validation (unit, before any DB call)", () => {
  const base = { enrollmentId: 1, outcome: "refund" as const, amount: 100, by: "staff" as const, actorId: 1, reason: "test" }
  const code = async (i: object) => {
    const r = await executeSeatCancellation(i as never)
    return r.ok ? "ok" : r.error.code
  }
  it("rejects negative / fractional amounts, bad outcome, bad ids, empty reason", async () => {
    expect(await code({ ...base, amount: -1 })).toBe("VALIDATION")
    expect(await code({ ...base, amount: 1.5 })).toBe("VALIDATION")
    expect(await code({ ...base, outcome: "voucher" })).toBe("VALIDATION")
    expect(await code({ ...base, enrollmentId: "abc" })).toBe("VALIDATION")
    expect(await code({ ...base, reason: "  " })).toBe("VALIDATION")
    expect(await code({ ...base, by: "robot" })).toBe("VALIDATION")
  })
  it("outcome none with a positive amount → VALIDATION", async () => {
    expect(await code({ ...base, outcome: "none", amount: 1 })).toBe("VALIDATION")
  })
})
