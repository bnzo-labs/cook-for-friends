import { z } from "zod"

import { consumeRateLimit } from "@/modules/identity"
import {
  getLessonPlayback,
  getLessonPlaybackForStaff,
  jsonResponse,
  rateLimited,
  resolveActor,
  serverError,
  unauthenticated,
  videoErrorResponse,
} from "@/modules/video"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({ lessonId: z.string().regex(/^\d{1,12}$/) })

const PLAYBACK_LIMIT_PER_HOUR = 120
const NO_STORE = { "cache-control": "private, no-store" }

/**
 * GET /api/video/playback?lessonId= — CONTRACT §5.1. Signed playback URL for a
 * lesson the caller may watch. The URL is returned once and never logged.
 */
export async function GET(request: Request): Promise<Response> {
  const parsed = querySchema.safeParse({ lessonId: new URL(request.url).searchParams.get("lessonId") })
  if (!parsed.success) {
    return jsonResponse(
      400,
      { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION" } },
      NO_STORE,
    )
  }
  const lessonId = Number(parsed.data.lessonId)

  try {
    const actor = await resolveActor(request.headers)
    if (actor.kind === "anonymous") return withNoStore(unauthenticated())

    if (actor.kind === "staff") {
      const result = await getLessonPlaybackForStaff({ staffId: actor.id, lessonId })
      return result.ok ? ok(result.data) : withNoStore(videoErrorResponse(result.error))
    }

    const limit = await consumeRateLimit({
      scope: "email",
      namespace: "video-playback",
      key: String(actor.customer.id),
      limit: PLAYBACK_LIMIT_PER_HOUR,
      windowSeconds: 3600,
    })
    if (!limit.allowed) return withNoStore(rateLimited(limit.retryAfterSeconds))

    const result = await getLessonPlayback({ customerId: actor.customer.id, lessonId })
    return result.ok ? ok(result.data) : withNoStore(videoErrorResponse(result.error))
  } catch (error) {
    console.error("[video] GET /api/video/playback failed", error)
    return withNoStore(serverError())
  }
}

function ok(data: { url: string; posterUrl?: string; expiresAt: string }): Response {
  return jsonResponse(200, { ok: true, data }, NO_STORE)
}

function withNoStore(res: Response): Response {
  res.headers.set("cache-control", "private, no-store")
  return res
}
