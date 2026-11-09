import { z } from "zod"

import { readBody } from "@/modules/identity"
import {
  createLessonUpload,
  forbiddenOrigin,
  isAllowedOrigin,
  jsonResponse,
  resolveActor,
  serverError,
  unauthenticated,
  videoErrorResponse,
} from "@/modules/video"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ lessonId: z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]) })

/** POST /api/video/uploads { lessonId } — staff only. Starts a direct upload, marks the lesson `preparing`. */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()
  try {
    const actor = await resolveActor(request.headers)
    if (actor.kind === "anonymous") return unauthenticated()
    if (actor.kind !== "staff") return forbiddenOrigin()

    const parsed = bodySchema.safeParse(await readBody(request))
    if (!parsed.success) {
      return jsonResponse(400, { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION" } })
    }
    const result = await createLessonUpload(Number(parsed.data.lessonId))
    return result.ok ? jsonResponse(200, { ok: true, data: result.data }) : videoErrorResponse(result.error)
  } catch (error) {
    console.error("[video] POST /api/video/uploads failed", error)
    return serverError()
  }
}
