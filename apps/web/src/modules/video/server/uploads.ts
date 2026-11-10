import type { ID, Result } from "@/modules/_shared"
import { getLessonVideoRef, recordLessonVideo } from "@/modules/catalog"

import { fakeAssetIdFor, fakePlaybackIdFor, parseFakeUploadId } from "./providers/fake"
import { getVideoProvider } from "./provider"
import { applyVideoEvent } from "./webhook"

const notConfigured = { code: "UPSTREAM", service: "video", message: "not_configured" } as const

/** Staff: start a direct upload for a lesson and mark it `preparing`. */
export async function createLessonUpload(lessonId: ID): Promise<Result<{ uploadUrl: string; uploadId: string }>> {
  const provider = getVideoProvider()
  if (!provider) return { ok: false, error: notConfigured }
  const ref = await getLessonVideoRef(lessonId)
  if (!ref) return { ok: false, error: { code: "NOT_FOUND", entity: "lesson" } }
  try {
    const upload = await provider.createUpload({ lessonId: String(ref.lessonId) })
    // A replacement drops the previous asset ids; the old asset is orphaned at
    // the provider (cleanup is a manual/staff action, out of scope).
    await recordLessonVideo(ref.lessonId, {
      provider: provider.name,
      uploadId: upload.uploadId,
      status: "preparing",
      assetId: null,
      playbackId: null,
    })
    return { ok: true, data: upload }
  } catch (error) {
    console.error("[video] createUpload failed", { lessonId, provider: provider.name, error })
    return { ok: false, error: { code: "UPSTREAM", service: "video", message: "upload_failed" } }
  }
}

export type UploadPoll = { status: "none" | "preparing" | "ready" | "errored"; assetId?: string; durationSec?: number }

/**
 * Staff: report (and, when the provider is ahead of the webhook, record) the
 * upload's state. Lets staging work without a configured webhook.
 */
export async function pollLessonUpload(i: { lessonId: ID; uploadId: string }): Promise<Result<UploadPoll>> {
  const provider = getVideoProvider()
  if (!provider) return { ok: false, error: notConfigured }
  const ref = await getLessonVideoRef(i.lessonId)
  if (!ref) return { ok: false, error: { code: "NOT_FOUND", entity: "lesson" } }
  // The lesson tracks a newer upload (replace) or none: this id is stale.
  if (ref.uploadId !== i.uploadId) return { ok: false, error: { code: "NOT_FOUND", entity: "upload" } }

  const done = (r: typeof ref): UploadPoll => ({
    status: r.status,
    ...(r.assetId ? { assetId: r.assetId } : {}),
    ...(r.durationSec !== null ? { durationSec: r.durationSec } : {}),
  })
  if (ref.status === "ready" || ref.status === "errored") return { ok: true, data: done(ref) }

  try {
    const asset = await provider.getAsset(ref.assetId || i.uploadId)
    if (!asset.assetId) return { ok: true, data: { status: "preparing" } }
    await applyVideoEvent(
      {
        type: asset.status === "ready" ? "asset.ready" : asset.status === "errored" ? "asset.errored" : "upload.asset_created",
        lessonId: String(ref.lessonId),
        uploadId: i.uploadId,
        assetId: asset.assetId,
        playbackId: asset.playbackId,
        durationSec: asset.durationSec,
      },
      provider.name,
    )
    const fresh = await getLessonVideoRef(i.lessonId)
    return { ok: true, data: fresh ? done(fresh) : { status: asset.status } }
  } catch (error) {
    console.error("[video] poll failed", { lessonId: i.lessonId, provider: provider.name, error })
    return { ok: false, error: { code: "UPSTREAM", service: "video", message: "poll_failed" } }
  }
}

/** Duration recorded for fake uploads (the bytes are discarded, so it is a placeholder). */
export const FAKE_DURATION_SEC = 30
/** Fake upload bodies above this are rejected (413). */
export const FAKE_UPLOAD_MAX_BYTES = 1024 * 1024

/** Fake adapter: the PUT "uploads" the clip; record the lesson as ready (stateless, no webhook). */
export async function completeFakeUpload(uploadId: string): Promise<Result<{ assetId: string }>> {
  const parsed = parseFakeUploadId(uploadId)
  if (!parsed) return { ok: false, error: { code: "NOT_FOUND", entity: "upload" } }
  const ref = await getLessonVideoRef(parsed.lessonId)
  if (!ref || ref.uploadId !== uploadId) return { ok: false, error: { code: "NOT_FOUND", entity: "upload" } }
  const assetId = fakeAssetIdFor(parsed.nonce)
  await recordLessonVideo(ref.lessonId, {
    provider: "fake",
    assetId,
    playbackId: fakePlaybackIdFor(parsed.nonce),
    durationSec: FAKE_DURATION_SEC,
    status: "ready",
  })
  return { ok: true, data: { assetId } }
}
