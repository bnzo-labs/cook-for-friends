import { describe, expect, it } from "vitest"

import { sanitizeNext } from "../server/next-path"

describe("sanitizeNext", () => {
  it.each([
    ["/fr/account", "/fr/account"],
    ["/en/account/orders?page=2#top", "/en/account/orders?page=2#top"],
    ["/", "/"],
  ])("keeps same-origin path %s", (input, out) => {
    expect(sanitizeNext(input)).toBe(out)
  })

  it.each([
    "https://evil.com",
    "http://evil.com/fr/account",
    "//evil.com",
    "//evil.com/fr/account",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "fr/account",
    "/fr/account\r\nSet-Cookie: x=1",
    "/fr/\taccount",
    "",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(sanitizeNext(input)).toBeNull()
  })

  it("rejects non-strings", () => {
    expect(sanitizeNext(undefined)).toBeNull()
    expect(sanitizeNext(null)).toBeNull()
  })
})
