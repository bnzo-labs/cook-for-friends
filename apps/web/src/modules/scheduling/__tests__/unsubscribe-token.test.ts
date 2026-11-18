import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { signWaitlistRemoveToken, verifyWaitlistRemoveToken, WAITLIST_REMOVE_TTL_SECONDS } from "../server/unsubscribe-token"

const SECRET = "s".repeat(40)
const NOW = new Date("2026-11-17T12:00:00Z")
let prev: string | undefined

beforeEach(() => {
  prev = process.env.PAYLOAD_SECRET
  process.env.PAYLOAD_SECRET = SECRET
})
afterEach(() => {
  if (prev === undefined) delete process.env.PAYLOAD_SECRET
  else process.env.PAYLOAD_SECRET = prev
})

describe("waitlist remove token", () => {
  it("round-trips the entry id", () => {
    expect(verifyWaitlistRemoveToken(signWaitlistRemoveToken(42, NOW), NOW)).toBe(42)
  })
  it("contains no PII, only id.exp.sig", () => {
    expect(signWaitlistRemoveToken(42, NOW)).toMatch(/^42\.\d+\.[A-Za-z0-9_-]+$/)
  })
  it("rejects a tampered id", () => {
    const [, exp, sig] = signWaitlistRemoveToken(42, NOW).split(".")
    expect(verifyWaitlistRemoveToken(`43.${exp}.${sig}`, NOW)).toBeNull()
  })
  it("rejects a tampered expiry", () => {
    const [id, exp, sig] = signWaitlistRemoveToken(42, NOW).split(".")
    expect(verifyWaitlistRemoveToken(`${id}.${Number(exp) + 1}.${sig}`, NOW)).toBeNull()
  })
  it("rejects a token signed with another secret", () => {
    const t = signWaitlistRemoveToken(42, NOW)
    process.env.PAYLOAD_SECRET = "x".repeat(40)
    expect(verifyWaitlistRemoveToken(t, NOW)).toBeNull()
  })
  it("rejects an expired token, accepts just before expiry", () => {
    const t = signWaitlistRemoveToken(42, NOW)
    expect(verifyWaitlistRemoveToken(t, new Date(NOW.getTime() + (WAITLIST_REMOVE_TTL_SECONDS - 1) * 1000))).toBe(42)
    expect(verifyWaitlistRemoveToken(t, new Date(NOW.getTime() + WAITLIST_REMOVE_TTL_SECONDS * 1000))).toBeNull()
  })
  it.each([undefined, null, 5, "", "a.b", "1.2", "1.2.3.4", "0.9999999999.x", "-1.5.x", `1.2.${"a".repeat(300)}`])("rejects malformed %s", (v) => {
    expect(verifyWaitlistRemoveToken(v, NOW)).toBeNull()
  })
})
