import { describe, expect, it } from "vitest"

import { clientIp } from "../server/http"

/** W4-03b (W2-11 L-6): Vercel platform headers win over a spoofable x-forwarded-for. */
describe("clientIp (unit)", () => {
  const h = (o: Record<string, string>) => new Headers(o)

  it("prefers x-vercel-forwarded-for, then x-real-ip, then first x-forwarded-for hop", () => {
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1")
    expect(clientIp(h({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "6.6.6.6" }))).toBe("2.2.2.2")
    expect(clientIp(h({ "x-forwarded-for": " 3.3.3.3 , 4.4.4.4" }))).toBe("3.3.3.3")
  })
  it("unknown when no header; empty values ignored; capped at 64 chars", () => {
    expect(clientIp(h({}))).toBe("unknown")
    expect(clientIp(h({ "x-vercel-forwarded-for": "", "x-forwarded-for": "5.5.5.5" }))).toBe("5.5.5.5")
    expect(clientIp(h({ "x-real-ip": "a".repeat(100) }))).toHaveLength(64)
  })
})
