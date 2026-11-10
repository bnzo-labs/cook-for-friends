import { describe, expect, it } from "vitest"

import { signFake, verifyFake } from "../server/fake-token"

const SECRET = "s".repeat(32)
const base = { assetId: "fakeasset_abc", exp: Math.floor(Date.now() / 1000) + 600, viewerId: "7" }

describe("fake sign/verify", () => {
  it("accepts a valid signature", () => {
    expect(verifyFake(SECRET, { ...base, sig: signFake(SECRET, base) })).toEqual({ ok: true })
  })

  it("rejects an expired token", () => {
    const past = { ...base, exp: Math.floor(Date.now() / 1000) - 1 }
    expect(verifyFake(SECRET, { ...past, sig: signFake(SECRET, past) })).toEqual({ ok: false, reason: "expired" })
  })

  it("rejects tampered asset, viewer and exp", () => {
    const sig = signFake(SECRET, base)
    expect(verifyFake(SECRET, { ...base, assetId: "fakeasset_zzz", sig })).toMatchObject({ ok: false, reason: "bad_signature" })
    expect(verifyFake(SECRET, { ...base, viewerId: "8", sig })).toMatchObject({ ok: false, reason: "bad_signature" })
    expect(verifyFake(SECRET, { ...base, exp: base.exp + 1, sig })).toMatchObject({ ok: false, reason: "bad_signature" })
  })

  it("rejects a signature made with another secret", () => {
    const sig = signFake("o".repeat(32), base)
    expect(verifyFake(SECRET, { ...base, sig })).toMatchObject({ ok: false, reason: "bad_signature" })
  })

  it("rejects malformed input without throwing (also length mismatch, non-hex)", () => {
    expect(verifyFake(SECRET, { ...base, sig: "abc" })).toEqual({ ok: false, reason: "malformed" })
    expect(verifyFake(SECRET, { ...base, sig: "z".repeat(64) })).toEqual({ ok: false, reason: "malformed" })
    expect(verifyFake(SECRET, { ...base, exp: Number.NaN, sig: signFake(SECRET, base) })).toEqual({ ok: false, reason: "malformed" })
    expect(verifyFake(SECRET, { ...base, assetId: "", sig: signFake(SECRET, base) })).toEqual({ ok: false, reason: "malformed" })
  })

  it("compares with timingSafeEqual (source check)", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(new URL("../server/fake-token.ts", import.meta.url), "utf8")
    expect(src).toContain("timingSafeEqual")
  })
})
