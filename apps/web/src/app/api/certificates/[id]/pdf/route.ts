import { z } from "zod"

import { locales } from "@/i18n/locales"
import { jsonResponse } from "@/modules/identity"
import { getCertificateForPdf, getRequestActor, renderCertificatePdf } from "@/modules/learning"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const notFound = () => jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", messageKey: "errors.NOT_FOUND" } })
const idSchema = z.string().regex(/^[1-9]\d{0,15}$/)
const localeSchema = z.enum(locales)

/**
 * GET /api/certificates/:id/pdf?locale= — owner customer or staff → PDF
 * attachment. Anyone else (anonymous, other customer, unknown id) → 404.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id: rawId } = await ctx.params
    const id = idSchema.safeParse(rawId)
    if (!id.success) return notFound()

    const actor = await getRequestActor(request.headers)
    const cert = await getCertificateForPdf(Number(id.data), actor)
    if (!cert) return notFound()

    const rawLocale = new URL(request.url).searchParams.get("locale")
    const asked = rawLocale === null ? null : localeSchema.safeParse(rawLocale)
    if (asked && !asked.success) {
      return jsonResponse(400, { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION" } })
    }
    const pdf = await renderCertificatePdf(cert.id, asked?.success ? asked.data : cert.locale)
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="certificat-${cert.verificationCode}.pdf"`,
        "cache-control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("[learning] GET /api/certificates/:id/pdf failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}
