import { beforeEach, describe, expect, it, vi } from "vitest"

const getRequestActor = vi.fn()
const getCertificateForPdf = vi.fn()
const renderCertificatePdf = vi.fn()
vi.mock("@/modules/learning", () => ({
  getRequestActor: (...a: unknown[]) => getRequestActor(...a),
  getCertificateForPdf: (...a: unknown[]) => getCertificateForPdf(...a),
  renderCertificatePdf: (...a: unknown[]) => renderCertificatePdf(...a),
}))
vi.mock("@/modules/identity", async () => await import("../../../../modules/identity/server/http"))

import { GET } from "../[id]/pdf/route"

const call = (id: string, qs = "") =>
  GET(new Request(`http://localhost/api/certificates/${id}/pdf${qs}`), { params: Promise.resolve({ id }) })

describe("GET /api/certificates/:id/pdf", () => {
  beforeEach(() => {
    getRequestActor.mockReset().mockResolvedValue({ kind: "customer", id: 1 })
    getCertificateForPdf.mockReset().mockResolvedValue({ id: 4, verificationCode: "7K3M9QX2VD", locale: "fr" })
    renderCertificatePdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.3 fake"))
  })

  it("owner/staff → PDF attachment, private no-store, filename from the code", async () => {
    const res = await call("4")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="certificat-7K3M9QX2VD.pdf"')
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-")
    expect(renderCertificatePdf).toHaveBeenCalledWith(4, "fr")
  })

  it("?locale= overrides the certificate locale", async () => {
    await call("4", "?locale=en")
    expect(renderCertificatePdf).toHaveBeenCalledWith(4, "en")
  })

  it("bogus locale → 400", async () => {
    expect((await call("4", "?locale=de")).status).toBe(400)
    expect(renderCertificatePdf).not.toHaveBeenCalled()
  })

  it("anonymous / other customer / unknown → 404, never renders", async () => {
    getCertificateForPdf.mockResolvedValue(null)
    expect((await call("4")).status).toBe(404)
    expect(renderCertificatePdf).not.toHaveBeenCalled()
  })

  it.each(["abc", "0", "-3", "2.5"])("malformed id %j → 404 without lookup", async (id) => {
    expect((await call(id)).status).toBe(404)
    expect(getCertificateForPdf).not.toHaveBeenCalled()
  })

  it("render failure → 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    renderCertificatePdf.mockRejectedValue(new Error("pdf boom"))
    expect((await call("4")).status).toBe(500)
  })
})
