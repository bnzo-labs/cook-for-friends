import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  env: {
    R2_ACCOUNT_ID: "testacct",
    R2_ACCESS_KEY_ID: "AKIATEST",
    R2_SECRET_ACCESS_KEY: "secrettest",
    R2_BUCKET: "test-bucket",
  },
}))

import { attachmentDisposition, presignR2Get } from "@/lib/r2"

describe("presignR2Get", () => {
  it("signs against the R2 endpoint with ttl and encoded key", async () => {
    const { url, expiresAt } = await presignR2Get({ key: "certs/a b/é.pdf", ttlSeconds: 300 })
    const u = new URL(url)
    expect(u.host).toBe("test-bucket.testacct.r2.cloudflarestorage.com")
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300")
    expect(u.pathname).toBe("/certs/a%20b/%C3%A9.pdf")
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())
  })

  it("clamps ttl to 60..900", async () => {
    const lo = new URL((await presignR2Get({ key: "k", ttlSeconds: 1 })).url)
    const hi = new URL((await presignR2Get({ key: "k", ttlSeconds: 99999 })).url)
    expect(lo.searchParams.get("X-Amz-Expires")).toBe("60")
    expect(hi.searchParams.get("X-Amz-Expires")).toBe("900")
  })

  it("adds attachment disposition with RFC 5987 filename", async () => {
    const { url } = await presignR2Get({
      key: "k",
      ttlSeconds: 120,
      filename: "Attestation été.pdf",
      contentType: "application/pdf",
    })
    const u = new URL(url)
    const cd = u.searchParams.get("response-content-disposition")
    expect(cd).toContain("attachment;")
    expect(cd).toContain("filename*=UTF-8''Attestation%20%C3%A9t%C3%A9.pdf")
    expect(u.searchParams.get("response-content-type")).toBe("application/pdf")
  })

  it("omits disposition when no filename", async () => {
    const u = new URL((await presignR2Get({ key: "k", ttlSeconds: 120 })).url)
    expect(u.searchParams.get("response-content-disposition")).toBeNull()
  })
})

describe("attachmentDisposition", () => {
  it("escapes quotes and newlines", () => {
    const d = attachmentDisposition('a"b\nc.pdf')
    expect(d).not.toMatch(/\n/)
    expect(d).toContain('filename="a_b c.pdf"')
  })
})
