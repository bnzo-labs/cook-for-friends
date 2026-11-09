import { describe, expect, it } from "vitest"

import { defaultNextPath, magicLinkUrl } from "../server/magic-link"

describe("magic-link localized URLs (CCR-W3-2)", () => {
  it("FR uses the translated public path", () => {
    const url = new URL(magicLinkUrl("fr", "tok_en-1"))
    expect(url.pathname).toBe("/fr/connexion/verifier")
    expect(url.searchParams.get("token")).toBe("tok_en-1")
  })

  it("EN uses the English public path", () => {
    const url = new URL(magicLinkUrl("en", "tok_en-1"))
    expect(url.pathname).toBe("/en/auth/verify")
    expect(url.searchParams.get("token")).toBe("tok_en-1")
  })

  it("default post-login destination is localized", () => {
    expect(defaultNextPath("fr")).toBe("/fr/compte")
    expect(defaultNextPath("en")).toBe("/en/account")
  })

  it("token is URL-encoded", () => {
    const url = new URL(magicLinkUrl("en", "a b&c"))
    expect(url.searchParams.get("token")).toBe("a b&c")
    expect([...url.searchParams.keys()]).toEqual(["token"])
  })
})
