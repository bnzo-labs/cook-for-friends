import { describe, expect, it } from "vitest"

import { CART_COOKIE, cartCookieHeader, moduleErrorResponse, newCartToken, readCartToken } from "../server/http"

describe("cart cookie", () => {
  it("token = 32 random bytes base64url (43 chars), unique", () => {
    const a = newCartToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newCartToken()).not.toBe(a)
  })

  it("flags: HttpOnly, SameSite=Lax, Path=/, 30 days, Secure only when asked", () => {
    const dev = cartCookieHeader("tok", false)
    expect(dev).toBe(`${CART_COOKIE}=tok; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`)
    expect(cartCookieHeader("tok", true)).toMatch(/; Secure$/)
  })

  it("reads a valid token, ignores malformed or absent ones", () => {
    const t = newCartToken()
    expect(readCartToken(new Headers({ cookie: `a=1; ${CART_COOKIE}=${t}; b=2` }))).toBe(t)
    expect(readCartToken(new Headers({ cookie: `${CART_COOKIE}=bad value` }))).toBeNull()
    expect(readCartToken(new Headers({ cookie: "other=1" }))).toBeNull()
    expect(readCartToken(new Headers())).toBeNull()
  })
})

describe("moduleErrorResponse (CONTRACT §2)", () => {
  it("maps codes to statuses and errors.<code> keys", () => {
    expect(moduleErrorResponse({ code: "SOLD_OUT", sessionId: 1 }, { available: 2 })).toEqual({
      status: 409,
      body: { ok: false, error: { code: "SOLD_OUT", messageKey: "errors.SOLD_OUT", details: { available: 2 } } },
    })
    expect(moduleErrorResponse({ code: "UPSTREAM", service: "stripe", message: "secret detail" })).toEqual({
      status: 502,
      body: { ok: false, error: { code: "UPSTREAM", messageKey: "errors.UPSTREAM" } },
    })
    expect(moduleErrorResponse({ code: "NOT_FOUND", entity: "x" }).status).toBe(404)
    expect(moduleErrorResponse({ code: "FORBIDDEN" }).status).toBe(403)
    expect(moduleErrorResponse({ code: "HOLD_EXPIRED", holdId: 1 }).status).toBe(409)
  })

  it("VALIDATION carries issues with field paths", () => {
    const issues = [{ path: "lines.0.attendees.1.email", message: "errors.ATTENDEE_EMAIL_DUPLICATE" }]
    const r = moduleErrorResponse({ code: "VALIDATION", issues })
    expect(r.status).toBe(400)
    expect(r.body.error).toEqual({ code: "VALIDATION", messageKey: "errors.VALIDATION", details: { issues }, issues })
  })

  it("known CONFLICT reasons get their own key; unknown → errors.CONFLICT", () => {
    expect(moduleErrorResponse({ code: "CONFLICT", reason: "COURSE_NOT_PURCHASABLE" }).body.error.messageKey).toBe(
      "errors.COURSE_NOT_PURCHASABLE",
    )
    expect(moduleErrorResponse({ code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" }).body.error.messageKey).toBe(
      "errors.SESSION_NOT_BOOKABLE",
    )
    expect(moduleErrorResponse({ code: "CONFLICT", reason: "OTHER" }).body.error.messageKey).toBe("errors.CONFLICT")
  })
})
