import { beforeEach, describe, expect, it, vi } from "vitest"

const getRequestActor = vi.fn()
const recordProgress = vi.fn()
const consumeRateLimit = vi.fn()
vi.mock("@/modules/learning", () => ({
  getRequestActor: (...a: unknown[]) => getRequestActor(...a),
  recordProgress: (...a: unknown[]) => recordProgress(...a),
}))
vi.mock("@/modules/identity", async () => {
  const http = await import("../../../../modules/identity/server/http")
  return { ...http, consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a) }
})

vi.mock("@/modules/commerce", async () => {
  const { moduleErrorResponse } = await import("../../../../modules/commerce/server/http")
  return { moduleErrorResponse }
})

import { POST } from "../route"

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/progress", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })

describe("POST /api/progress", () => {
  beforeEach(() => {
    getRequestActor.mockReset().mockResolvedValue({ kind: "customer", id: 3 })
    recordProgress.mockReset().mockResolvedValue({ ok: true, data: { courseCompleted: true, certificateId: 9 } })
    consumeRateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"
  })

  it("rejects a foreign Origin before anything else", async () => {
    const res = await POST(post({ lessonId: 1 }, { origin: "https://evil.example" }))
    expect(res.status).toBe(403)
    expect(getRequestActor).not.toHaveBeenCalled()
    expect(recordProgress).not.toHaveBeenCalled()
  })

  it("accepts same Origin and absent Origin", async () => {
    expect((await POST(post({ lessonId: 1 }, { origin: "http://localhost:3000" }))).status).toBe(200)
    expect((await POST(post({ lessonId: 1 }))).status).toBe(200)
  })

  it("anonymous and staff → 401", async () => {
    getRequestActor.mockResolvedValue(null)
    expect((await POST(post({ lessonId: 1 }))).status).toBe(401)
    getRequestActor.mockResolvedValue({ kind: "staff" })
    expect((await POST(post({ lessonId: 1 }))).status).toBe(401)
    expect(recordProgress).not.toHaveBeenCalled()
  })

  it.each([
    [{}],
    [{ lessonId: "abc" }],
    [{ lessonId: 0 }],
    [{ lessonId: -2 }],
    [{ lessonId: 1, completed: "yes" }],
    [{ lessonId: 1, positionSec: -1 }],
    [{ lessonId: 1, positionSec: "12" }],
  ])("validation failure %j → 400", async (body) => {
    const res = await POST(post(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION")
    expect(recordProgress).not.toHaveBeenCalled()
  })

  it("passes parsed body (string ids coerced) and returns the data envelope", async () => {
    const res = await POST(post({ lessonId: "12", completed: true, positionSec: 30.5 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: { courseCompleted: true, certificateId: 9 } })
    expect(recordProgress).toHaveBeenCalledWith({ customerId: 3, lessonId: 12, completed: true, positionSec: 30.5 })
  })

  it("rate limits 600/customer/h", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 })
    const res = await POST(post({ lessonId: 1 }))
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("42")
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ limit: 600, windowSeconds: 3600, key: "customer:3" }))
    expect(recordProgress).not.toHaveBeenCalled()
  })

  it("maps module errors (FORBIDDEN → 403, NOT_FOUND → 404)", async () => {
    recordProgress.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN" } })
    expect((await POST(post({ lessonId: 1 }))).status).toBe(403)
    recordProgress.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", entity: "lesson" } })
    expect((await POST(post({ lessonId: 1 }))).status).toBe(404)
  })

  it("unexpected failure → 500 with safe body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    recordProgress.mockRejectedValue(new Error("db down"))
    const res = await POST(post({ lessonId: 1 }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("db down")
  })
})
