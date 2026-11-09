import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  env: { R2_ACCOUNT_ID: "testacct", R2_ACCESS_KEY_ID: "AKIATEST", R2_SECRET_ACCESS_KEY: "secrettest", R2_BUCKET: "test-bucket" },
}))

const getMaterialDownload = vi.fn()
const hasActiveEntitlement = vi.fn()
vi.mock("@/modules/catalog", () => ({ getMaterialDownload: (...a: unknown[]) => getMaterialDownload(...a) }))
vi.mock("@/modules/access", () => ({ hasActiveEntitlement: (...a: unknown[]) => hasActiveEntitlement(...a) }))

import { getMaterialSignedUrl } from "../server/materials"

const download = { id: 5, courseIds: [10, 11], storageKey: "media/recette.pdf", filename: "Recette été.pdf", mimeType: "application/pdf" }

describe("getMaterialSignedUrl access matrix", () => {
  beforeEach(() => {
    getMaterialDownload.mockReset().mockResolvedValue(download)
    hasActiveEntitlement.mockReset().mockResolvedValue(false)
  })

  it("anonymous → null, nothing looked up", async () => {
    expect(await getMaterialSignedUrl(5, null)).toBeNull()
    expect(getMaterialDownload).not.toHaveBeenCalled()
  })

  it("unknown material → null", async () => {
    getMaterialDownload.mockResolvedValue(null)
    expect(await getMaterialSignedUrl(5, { kind: "staff" })).toBeNull()
  })

  it("customer without entitlement to any containing course → null", async () => {
    expect(await getMaterialSignedUrl(5, { kind: "customer", id: 1 })).toBeNull()
    expect(hasActiveEntitlement).toHaveBeenCalledTimes(2)
  })

  it("customer entitled to ANY containing course → R2 URL, 300 s, attachment", async () => {
    hasActiveEntitlement.mockImplementation(async (_c: number, course: number) => course === 11)
    const url = await getMaterialSignedUrl(5, { kind: "customer", id: 1 })
    expect(url).not.toBeNull()
    const u = new URL(url!)
    expect(u.host).toBe("test-bucket.testacct.r2.cloudflarestorage.com")
    expect(u.pathname).toBe("/media/recette.pdf")
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300")
    expect(u.searchParams.get("response-content-disposition")).toContain("attachment;")
  })

  it("staff bypasses entitlement", async () => {
    const url = await getMaterialSignedUrl(5, { kind: "staff" })
    expect(url).toContain("X-Amz-Expires=300")
    expect(hasActiveEntitlement).not.toHaveBeenCalled()
  })

  it("revoked/expired entitlement behaves as none", async () => {
    hasActiveEntitlement.mockResolvedValue(false)
    expect(await getMaterialSignedUrl(5, { kind: "customer", id: 2 })).toBeNull()
  })
})
