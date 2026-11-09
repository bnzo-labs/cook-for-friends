import { beforeEach, describe, expect, it, vi } from "vitest"

const getRequestActor = vi.fn()
const getMaterialSignedUrl = vi.fn()
vi.mock("@/modules/learning", () => ({
  getRequestActor: (...a: unknown[]) => getRequestActor(...a),
  getMaterialSignedUrl: (...a: unknown[]) => getMaterialSignedUrl(...a),
}))
vi.mock("@/modules/identity", async () => await import("../../../../modules/identity/server/http"))

import { GET } from "../[id]/route"

const call = (id: string) => GET(new Request(`http://localhost/api/materials/${id}`), { params: Promise.resolve({ id }) })

describe("GET /api/materials/:id", () => {
  beforeEach(() => {
    getRequestActor.mockReset().mockResolvedValue({ kind: "customer", id: 1 })
    getMaterialSignedUrl.mockReset().mockResolvedValue("https://b.acct.r2.cloudflarestorage.com/k?X-Amz-Expires=300")
  })

  it("302 to the signed URL, private no-store", async () => {
    const res = await call("5")
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toContain("X-Amz-Expires=300")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(getMaterialSignedUrl).toHaveBeenCalledWith(5, { kind: "customer", id: 1 })
  })

  it("anonymous, other customer, unknown → 404 (same answer)", async () => {
    getMaterialSignedUrl.mockResolvedValue(null)
    getRequestActor.mockResolvedValue(null)
    expect((await call("5")).status).toBe(404)
    getRequestActor.mockResolvedValue({ kind: "customer", id: 99 })
    expect((await call("5")).status).toBe(404)
  })

  it.each(["abc", "0", "-1", "1.5", "1e3", ""])("malformed id %j → 404 without lookup", async (id) => {
    expect((await call(id)).status).toBe(404)
    expect(getMaterialSignedUrl).not.toHaveBeenCalled()
  })

  it("unexpected failure → 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getMaterialSignedUrl.mockRejectedValue(new Error("r2 down"))
    expect((await call("5")).status).toBe(500)
  })
})
