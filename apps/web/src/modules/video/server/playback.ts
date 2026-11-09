import { hasActiveEntitlement } from "@/modules/access"
import type { ID, ISODate, Result } from "@/modules/_shared"
import { getLessonVideoRef, type LessonVideoRef } from "@/modules/catalog"

import { PLAYBACK_TTL_SECONDS } from "../types"
import { getVideoProvider } from "./provider"

export type PlaybackView = { url: string; posterUrl?: string; expiresAt: ISODate }

const notConfigured = { code: "UPSTREAM", service: "video", message: "not_configured" } as const

/** Sign a playback URL for a ready lesson video. The URL is never stored or logged. */
async function sign(ref: LessonVideoRef, viewerId: string): Promise<Result<PlaybackView>> {
  const provider = getVideoProvider()
  if (!provider) return { ok: false, error: notConfigured }
  // Not uploaded yet, still processing, or uploaded with another provider.
  if (ref.status !== "ready" || !ref.assetId || ref.provider !== provider.name) {
    return { ok: false, error: { code: "NOT_FOUND", entity: "video" } }
  }
  try {
    const playback = await provider.getPlayback({
      assetId: ref.assetId,
      playbackId: ref.playbackId ?? undefined,
      viewerId,
      ttlSeconds: PLAYBACK_TTL_SECONDS,
    })
    return { ok: true, data: playback }
  } catch (error) {
    console.error("[video] getPlayback failed", { lessonId: ref.lessonId, provider: provider.name, error })
    return { ok: false, error: { code: "UPSTREAM", service: "video", message: "playback_failed" } }
  }
}

/**
 * CONTRACT §4. Customers: lesson of a published course; entitlement required,
 * except `isPreview` lessons which any signed-in customer may play (Q13).
 */
export async function getLessonPlayback(i: { customerId: ID; lessonId: ID }): Promise<Result<PlaybackView>> {
  if (!getVideoProvider()) return { ok: false, error: notConfigured }
  const ref = await getLessonVideoRef(i.lessonId)
  if (!ref || ref.courseStatus !== "published") return { ok: false, error: { code: "NOT_FOUND", entity: "lesson" } }
  if (!ref.isPreview && !(await hasActiveEntitlement(i.customerId, ref.courseId))) {
    return { ok: false, error: { code: "FORBIDDEN" } }
  }
  return sign(ref, String(i.customerId))
}

/** Staff (users) may play any lesson, any course status (admin preview). */
export async function getLessonPlaybackForStaff(i: { staffId: string; lessonId: ID }): Promise<Result<PlaybackView>> {
  if (!getVideoProvider()) return { ok: false, error: notConfigured }
  const ref = await getLessonVideoRef(i.lessonId)
  if (!ref) return { ok: false, error: { code: "NOT_FOUND", entity: "lesson" } }
  return sign(ref, `staff-${i.staffId}`)
}
