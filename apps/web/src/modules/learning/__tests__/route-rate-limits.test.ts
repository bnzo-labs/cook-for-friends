import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * W4-03b (W3-10 L-9): per-customer limits on the certificate PDF (CPU-heavy render)
 * and material signed-URL routes. Unit: identity limiter + learning reads mocked.
 */
const consumeRateLimit = vi.fn()
const getRequestActor = vi.fn()
const getCertificateForPdf = vi.fn()
const renderCertificatePdf = vi.fn()
const getMaterialSignedUrl = vi.fn()

vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
}))
vi.mock("@/modules/learning", () => ({
  getRequestActor: (...a: unknown[]) => getRequestActor(...a),
  getCertificateForPdf: (...a: unknown[]) => getCertificateForPdf(...a),
  renderCertificatePdf: (...a: unknown[]) => renderCertificatePdf(...a),
  getMaterialSignedUrl: (...a: unknown[]) => getMaterialSignedUrl(...a),
}))

const { GET: pdfGET } = await import("@/app/api/certificates/[id]/pdf/route")
const { GET: materialGET } = await import("@/app/api/materials/[id]/route")

const ctx = (id = "5") => ({ params: Promise.resolve({ id }) })
const req = (path: string) => new Request(`http://localhost:3000${path}`)

describe("W3-10 L-9 learning route rate limits (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    getCertificateForPdf.mockResolvedValue({ id: 5, locale: "fr", verificationCode: "ABC" })
    renderCertificatePdf.mockResolvedValue(Buffer.from("%PDF"))
    getMaterialSignedUrl.mockResolvedValue("https://r2.example/x?sig=1")
  })

  it("certificate PDF: customer limited 30/h by customer id; 429 + retry-after, no render", async () => {
    getRequestActor.mockResolvedValue({ kind: "customer", id: 9 })
    expect((await pdfGET(req("/api/certificates/5/pdf"), ctx())).status).toBe(200)
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "learning-certificate-pdf", key: "customer:9", limit: 30, windowSeconds: 3600 }),
    )

    consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 120 })
    const res = await pdfGET(req("/api/certificates/5/pdf"), ctx())
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("120")
    expect(renderCertificatePdf).toHaveBeenCalledTimes(1)
  })

  it("material: customer limited 120/h; 429 never signs a URL", async () => {
    getRequestActor.mockResolvedValue({ kind: "customer", id: 9 })
    expect((await materialGET(req("/api/materials/5"), ctx())).status).toBe(302)
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "learning-material", key: "customer:9", limit: 120, windowSeconds: 3600 }),
    )

    consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 })
    const res = await materialGET(req("/api/materials/5"), ctx())
    expect(res.status).toBe(429)
    expect(getMaterialSignedUrl).toHaveBeenCalledTimes(1)
  })

  it("staff and anonymous are not counted (anonymous still gets 404 from the access check)", async () => {
    getRequestActor.mockResolvedValue({ kind: "staff" })
    expect((await pdfGET(req("/api/certificates/5/pdf"), ctx())).status).toBe(200)
    getRequestActor.mockResolvedValue(null)
    getMaterialSignedUrl.mockResolvedValue(null)
    expect((await materialGET(req("/api/materials/5"), ctx())).status).toBe(404)
    expect(consumeRateLimit).not.toHaveBeenCalled()
  })
})
