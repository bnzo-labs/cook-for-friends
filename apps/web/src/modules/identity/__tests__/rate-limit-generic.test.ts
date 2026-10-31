import { describe, expect, it, vi } from "vitest"

import { hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("identity.consumeRateLimit generic (integration)", () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })
  const load = async () => {
    const { getTestPayload } = await import("../../../../test/integration")
    await getTestPayload()
    return import("../index")
  }

  it("denies limit+1 with retryAfterSeconds > 0", async () => {
    const { consumeRateLimit } = await load()
    const base = { scope: "email" as const, namespace: `ns-${uid()}`, key: `a-${uid()}@example.com`, limit: 3, windowSeconds: 600 }
    for (let n = 0; n < 3; n++) expect((await consumeRateLimit(base)).allowed).toBe(true)
    const denied = await consumeRateLimit(base)
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSeconds).toBeGreaterThan(0)
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(600)
  })

  it("namespaces are isolated, and isolated from magic-link keys", async () => {
    const { consumeRateLimit } = await load()
    const key = `b-${uid()}@example.com`
    const a = { scope: "email" as const, namespace: `a-${uid()}`, key, limit: 1, windowSeconds: 600 }
    const b = { ...a, namespace: `b-${uid()}` }
    expect((await consumeRateLimit(a)).allowed).toBe(true)
    expect((await consumeRateLimit(a)).allowed).toBe(false)
    expect((await consumeRateLimit(b)).allowed).toBe(true)
    // magic-link limiter on the same raw key is unaffected
    const { getTestPayload } = await import("../../../../test/integration")
    const { consumeRateLimit: legacy } = await import("../server/rate-limit")
    expect((await legacy(await getTestPayload(), { scope: "email", key, limit: 1 })).allowed).toBe(true)
  })

  it("10 concurrent calls with limit 5 -> exactly 5 allowed", async () => {
    const { consumeRateLimit } = await load()
    const input = { scope: "ip" as const, namespace: `c-${uid()}`, key: `10.9.${Math.floor(Math.random() * 250)}.1`, limit: 5, windowSeconds: 600 }
    const res = await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit(input)))
    expect(res.filter((r) => r.allowed)).toHaveLength(5)
  })

  it("normalizes key (case/whitespace) and validates window", async () => {
    const { consumeRateLimit } = await load()
    const ns = `d-${uid()}`
    const k = `Mixed-${uid()}@Example.com`
    const base = { scope: "email" as const, namespace: ns, limit: 1, windowSeconds: 600 }
    expect((await consumeRateLimit({ ...base, key: k })).allowed).toBe(true)
    expect((await consumeRateLimit({ ...base, key: `  ${k.toLowerCase()} ` })).allowed).toBe(false)
    await expect(consumeRateLimit({ ...base, key: k, windowSeconds: 0 })).rejects.toThrow()
  })
})
