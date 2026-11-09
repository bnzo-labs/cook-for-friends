import {
  FAKE_UPLOAD_MAX_BYTES,
  completeFakeUpload,
  fakeEnabled,
  jsonResponse,
  resolveActor,
  serverError,
  unauthenticated,
  videoErrorResponse,
  forbiddenOrigin,
  isAllowedOrigin,
} from "@/modules/video"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PUT /api/video/fake-upload/:id — fake direct-upload target (staff only,
 * non-prod). Accepts and discards up to 1 MB, then marks the lesson ready.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!fakeEnabled()) return new Response(null, { status: 404 })
  if (!isAllowedOrigin(request)) return forbiddenOrigin()
  try {
    const actor = await resolveActor(request.headers)
    if (actor.kind === "anonymous") return unauthenticated()
    if (actor.kind !== "staff") return forbiddenOrigin()

    const declared = Number(request.headers.get("content-length") ?? 0)
    if (declared > FAKE_UPLOAD_MAX_BYTES) return jsonResponse(413, { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION" } })
    const bytes = (await request.arrayBuffer()).byteLength
    if (bytes > FAKE_UPLOAD_MAX_BYTES) return jsonResponse(413, { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION" } })

    const { id } = await ctx.params
    const result = await completeFakeUpload(id)
    return result.ok ? jsonResponse(200, { ok: true, data: result.data }) : videoErrorResponse(result.error)
  } catch (error) {
    console.error("[video] PUT /api/video/fake-upload failed", error)
    return serverError()
  }
}
