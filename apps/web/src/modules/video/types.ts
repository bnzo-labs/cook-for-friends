import type { Result } from "@/modules/_shared"

/** CONTRACT §4 `@/modules/video` (CCR-W3-7). */
export type VideoProviderName = "mux" | "bunny" | "fake"

export type VideoWebhookEvent = {
  type: "upload.asset_created" | "asset.ready" | "asset.errored" | "ignored"
  lessonId?: string
  uploadId?: string
  assetId?: string
  playbackId?: string
  durationSec?: number
}

export interface VideoProvider {
  readonly name: VideoProviderName
  getPlayback(i: {
    assetId: string
    playbackId?: string
    viewerId: string
    ttlSeconds: number
  }): Promise<{ url: string; posterUrl?: string; expiresAt: string }>
  createUpload(i: { lessonId: string }): Promise<{ uploadUrl: string; uploadId: string }>
  getAsset(assetIdOrUploadId: string): Promise<{
    assetId: string
    playbackId?: string
    status: "preparing" | "ready" | "errored"
    durationSec?: number
  }>
  verifyWebhook(rawBody: string, headers: Headers): Promise<Result<VideoWebhookEvent>>
}

/** Signed playback lifetime (DISCOVERY §5: <= 2 h). */
export const PLAYBACK_TTL_SECONDS = 3600
export const MIN_TTL_SECONDS = 60
export const MAX_TTL_SECONDS = 7200

export function clampTtl(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds)) return PLAYBACK_TTL_SECONDS
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(ttlSeconds)))
}
