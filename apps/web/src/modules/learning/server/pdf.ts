import type { ID, Locale } from "@/modules/_shared"

/**
 * CONTRACT §4 `renderCertificatePdf`. Lazy import keeps react-pdf out of the
 * Payload config graph (payload.config imports the learning barrel).
 */
export async function renderCertificatePdf(certificateId: ID, locale: Locale): Promise<Buffer> {
  const { renderCertificatePdf: render } = await import("../pdf/render")
  return render(certificateId, locale)
}
