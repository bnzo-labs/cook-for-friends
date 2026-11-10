import { applyVideoEvent, getVideoProvider, jsonResponse, serverError, videoErrorResponse } from "@/modules/video"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/video/webhook — CCR-W3-7. The raw body is verified against the
 * provider signature before anything is parsed or written. 200 also on replay
 * and on events for unknown lessons (providers retry non-2xx).
 */
export async function POST(request: Request): Promise<Response> {
  const provider = getVideoProvider()
  if (!provider) {
    return videoErrorResponse({ code: "UPSTREAM", service: "video", message: "not_configured" })
  }
  try {
    const rawBody = await request.text()
    const verified = await provider.verifyWebhook(rawBody, request.headers)
    if (!verified.ok) return videoErrorResponse(verified.error)
    const outcome = await applyVideoEvent(verified.data, provider.name)
    return jsonResponse(200, { ok: true, data: { outcome } })
  } catch (error) {
    console.error("[video] POST /api/video/webhook failed", error)
    return serverError()
  }
}
