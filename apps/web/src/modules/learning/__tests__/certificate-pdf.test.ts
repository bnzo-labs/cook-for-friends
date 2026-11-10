import { renderToBuffer } from "@react-pdf/renderer"
import { beforeAll, describe, expect, it } from "vitest"

import type { Locale } from "@/modules/_shared"

import { CertificateDocument } from "../pdf/certificate-document"
import { certificateStrings, formatCertificateDate } from "../pdf/render"
import { verifyUrl } from "../server/urls"
import { extractPdfText } from "./pdf-text"

const CODE = "7K3M9QX2VD"

async function render(locale: Locale, name: string) {
  const issuedAt = "2026-11-05T15:30:00.000Z"
  const strings = certificateStrings(locale, {
    date: formatCertificateDate(issuedAt, locale),
    url: verifyUrl(locale, CODE),
  })
  const element = CertificateDocument({
    customerName: name,
    courseTitle: locale === "fr" ? "Pain au levain" : "Sourdough bread",
    verificationCode: CODE,
    strings,
  })
  const started = performance.now()
  const buf = await renderToBuffer(element)
  return { buf, ms: performance.now() - started, strings }
}

describe("certificate PDF", () => {
  // Cold start (yoga/fontkit init) is not the steady-state render time the criterion measures.
  beforeAll(async () => {
    await render("fr", "Warm Up")
  }, 90_000)

  it.each(["fr", "en"] as const)("renders %s: valid PDF, small, fast, with name + code", async (locale) => {
    const { buf, ms, strings } = await render(locale, "Zoé Tremblay")
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(buf.length).toBeLessThan(200 * 1024)
    expect(ms).toBeLessThan(2000)
    const text = extractPdfText(buf)
    expect(text).toContain("Zoé Tremblay")
    expect(text).toContain(CODE)
    expect(text).toContain(strings.title)
  })

  it("A4 landscape", async () => {
    const { buf } = await render("en", "Ana Roy")
    // 841.89 x 595.28 pt
    expect(buf.toString("latin1")).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+841\.89/)
  })

  it("localizes the date (Toronto TZ, no forced capitalisation)", () => {
    // 2026-11-05T03:30Z is still Nov 4 in Toronto (EST, UTC-5)
    expect(formatCertificateDate("2026-11-05T03:30:00.000Z", "fr")).toBe("4 novembre 2026")
    expect(formatCertificateDate("2026-11-05T03:30:00.000Z", "en")).toBe("November 4, 2026")
  })

  it("strings carry the localized verify URL, no raw ICU placeholders", () => {
    const fr = certificateStrings("fr", { date: "4 novembre 2026", url: verifyUrl("fr", CODE) })
    const en = certificateStrings("en", { date: "November 4, 2026", url: verifyUrl("en", CODE) })
    expect(fr.verifyAt).toContain(`/fr/certificats/verifier/${CODE}`)
    expect(en.verifyAt).toContain(`/en/certificates/verify/${CODE}`)
    for (const v of [...Object.values(fr), ...Object.values(en)]) expect(v).not.toMatch(/\{\w+\}/)
  })
})
