import type { Result } from "@/modules/_shared"

import { type VideoProvider, type VideoWebhookEvent, clampTtl } from "../../types"
import { muxConfig, siteUrl } from "../config"
import { getMuxPort, type MuxPort } from "../mux-port"

const STREAM = "https://stream.mux.com"
const IMAGE = "https://image.mux.com"

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined)

/** Map a verified Mux webhook envelope to the provider-agnostic event. */
export function mapMuxEvent(envelope: { type: string; data: Record<string, unknown> }): VideoWebhookEvent {
  const d = envelope.data
  switch (envelope.type) {
    case "video.upload.asset_created": {
      const settings = (d.new_asset_settings ?? {}) as Record<string, unknown>
      return {
        type: "upload.asset_created",
        lessonId: str(settings.passthrough),
        uploadId: str(d.id),
        assetId: str(d.asset_id),
      }
    }
    case "video.asset.ready":
    case "video.asset.errored": {
      const ids = Array.isArray(d.playback_ids) ? (d.playback_ids as Record<string, unknown>[]) : []
      const signed = ids.find((p) => p.policy === "signed")
      const duration = typeof d.duration === "number" ? Math.round(d.duration) : undefined
      return {
        type: envelope.type === "video.asset.ready" ? "asset.ready" : "asset.errored",
        lessonId: str(d.passthrough),
        uploadId: str(d.upload_id),
        assetId: str(d.id),
        playbackId: str(signed?.id),
        durationSec: duration,
      }
    }
    default:
      return { type: "ignored" }
  }
}

export function createMuxProvider(port: MuxPort = getMuxPort()): VideoProvider {
  return {
    name: "mux",

    async getPlayback({ assetId, playbackId, ttlSeconds }) {
      if (!playbackId) throw new Error(`mux: asset ${assetId} has no signed playback id`)
      const ttl = clampTtl(ttlSeconds)
      const [video, thumb] = await Promise.all([
        port.signToken({ playbackId, audience: "v", ttlSeconds: ttl }),
        port.signToken({ playbackId, audience: "t", ttlSeconds: ttl }),
      ])
      return {
        url: `${STREAM}/${playbackId}.m3u8?token=${video}`,
        posterUrl: `${IMAGE}/${playbackId}/thumbnail.jpg?token=${thumb}`,
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      }
    },

    async createUpload({ lessonId }) {
      const upload = await port.createDirectUpload({ passthrough: lessonId, corsOrigin: siteUrl() })
      return { uploadUrl: upload.url, uploadId: upload.id }
    },

    async getAsset(assetIdOrUploadId) {
      const asset = await port.getAsset(assetIdOrUploadId)
      if (asset) return toAssetState(asset)
      const upload = await port.getUpload(assetIdOrUploadId)
      if (!upload) throw new Error(`mux: ${assetIdOrUploadId} is neither an asset nor an upload`)
      if (upload.status === "errored" || upload.status === "cancelled" || upload.status === "timed_out") {
        return { assetId: upload.assetId ?? "", status: "errored" }
      }
      if (!upload.assetId) return { assetId: "", status: "preparing" }
      const created = await port.getAsset(upload.assetId)
      return created ? toAssetState(created) : { assetId: upload.assetId, status: "preparing" }
    },

    async verifyWebhook(rawBody, headers): Promise<Result<VideoWebhookEvent>> {
      const secret = muxConfig().webhookSecret
      if (!secret) return { ok: false, error: { code: "UPSTREAM", service: "video", message: "not_configured" } }
      try {
        const envelope = await port.unwrapWebhook(rawBody, headers, secret)
        return { ok: true, data: mapMuxEvent(envelope) }
      } catch {
        // Bad signature, stale timestamp, malformed JSON: all the same to the caller.
        return { ok: false, error: { code: "FORBIDDEN" } }
      }
    },
  }
}

function toAssetState(a: {
  id: string
  status: string
  durationSec: number | null
  signedPlaybackId: string | null
}): { assetId: string; playbackId?: string; status: "preparing" | "ready" | "errored"; durationSec?: number } {
  const status = a.status === "ready" ? "ready" : a.status === "errored" ? "errored" : "preparing"
  return {
    assetId: a.id,
    status,
    ...(a.signedPlaybackId ? { playbackId: a.signedPlaybackId } : {}),
    ...(a.durationSec !== null ? { durationSec: Math.round(a.durationSec) } : {}),
  }
}
