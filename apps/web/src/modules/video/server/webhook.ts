import { getLessonVideoRef, recordLessonVideo } from "@/modules/catalog"

import type { VideoWebhookEvent } from "../types"

export type ApplyOutcome = "applied" | "noop" | "stale" | "unknown_lesson" | "ignored"

/**
 * Record a verified provider event on the lesson via catalog. Idempotent (same
 * state twice = no write), stale-safe (events of a replaced upload/asset are
 * dropped) and never downgrades `ready`. Unknown lesson = warn, not an error.
 */
export async function applyVideoEvent(
  event: VideoWebhookEvent,
  provider: "mux" | "bunny" | "fake",
): Promise<ApplyOutcome> {
  if (event.type === "ignored" || !event.lessonId) return "ignored"
  const ref = await getLessonVideoRef(event.lessonId)
  if (!ref) {
    console.warn("[video] webhook for unknown lesson", { lessonId: event.lessonId, type: event.type })
    return "unknown_lesson"
  }

  // A newer upload replaced this one, or the lesson already tracks another asset.
  if (event.uploadId && ref.uploadId && ref.uploadId !== event.uploadId) return "stale"
  if (event.type !== "upload.asset_created" && event.assetId && ref.assetId && ref.assetId !== event.assetId) {
    return "stale"
  }

  if (event.type === "upload.asset_created") {
    if (ref.assetId === event.assetId && (ref.status === "preparing" || ref.status === "ready")) return "noop"
    await recordLessonVideo(ref.lessonId, {
      provider,
      uploadId: event.uploadId,
      assetId: event.assetId,
      status: "preparing",
    })
    return "applied"
  }

  if (event.type === "asset.ready") {
    if (ref.status === "ready" && ref.assetId === event.assetId && ref.playbackId === (event.playbackId ?? ref.playbackId)) {
      return "noop"
    }
    await recordLessonVideo(ref.lessonId, {
      provider,
      ...(event.uploadId ? { uploadId: event.uploadId } : {}),
      assetId: event.assetId,
      playbackId: event.playbackId,
      durationSec: event.durationSec,
      status: "ready",
    })
    return "applied"
  }

  // asset.errored
  if (ref.status === "errored" && ref.assetId === event.assetId) return "noop"
  if (ref.status === "ready" && ref.assetId === event.assetId) return "noop"
  await recordLessonVideo(ref.lessonId, { provider, assetId: event.assetId, status: "errored" })
  return "applied"
}
