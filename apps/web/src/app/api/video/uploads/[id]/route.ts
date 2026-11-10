import { z } from "zod"

import {
  jsonResponse,
  pollLessonUpload,
  resolveActor,
  serverError,
  unauthenticated,
  videoErrorResponse,
  forbiddenOrigin,
} from "@/modules/video"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  uploadId: z.string().min(1).max(200),
  lessonId: z.string().regex(/^\d{1,12}$/),
})

/** GET /api/video/uploads/:uploadId?lessonId= — staff only. Polls the provider and records the result. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await resolveActor(request.headers)
    if (actor.kind === "anonymous") return unauthenticated()
    if (actor.kind !== "staff") return forbiddenOrigin()

    const { id } = await ctx.params
    const parsed = paramsSchema.safeParse({
      uploadId: id,
      lessonId: new URL(request.url).searchParams.get("lessonId"),
    })
    if (!parsed.success) {
      return jsonResponse(400, { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION" } })
    }
    const result = await pollLessonUpload({ lessonId: Number(parsed.data.lessonId), uploadId: parsed.data.uploadId })
    return result.ok
      ? jsonResponse(200, { ok: true, data: result.data })
      : videoErrorResponse(result.error)
  } catch (error) {
    console.error("[video] GET /api/video/uploads/:id failed", error)
    return serverError()
  }
}
