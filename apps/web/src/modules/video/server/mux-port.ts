import Mux from "@mux/mux-node"

import { muxConfig, type MuxConfig } from "./config"

/**
 * The only seam between the video module and Mux (same pattern as commerce's
 * stripe-port). Production gets the real SDK; tests swap a fake via
 * `setMuxPortForTests`. JWT signing and webhook verification are local crypto
 * (no network), so unit tests exercise them through the real implementation.
 */
export type MuxUploadInfo = { id: string; url: string }
export type MuxUploadState = { status: string; assetId: string | null }
export type MuxAssetInfo = {
  id: string
  status: string
  durationSec: number | null
  signedPlaybackId: string | null
}
/** Loose Mux webhook envelope; only the fields the adapter reads. */
export type MuxWebhookEnvelope = { type: string; data: Record<string, unknown> }

export interface MuxPort {
  createDirectUpload(i: { passthrough: string; corsOrigin: string }): Promise<MuxUploadInfo>
  getUpload(uploadId: string): Promise<MuxUploadState | null>
  getAsset(assetId: string): Promise<MuxAssetInfo | null>
  signToken(i: { playbackId: string; audience: "v" | "t"; ttlSeconds: number }): Promise<string>
  /** Throws on bad signature, stale timestamp or malformed body. */
  unwrapWebhook(rawBody: string, headers: Headers, secret: string): Promise<MuxWebhookEnvelope>
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404
}

export function createRealMuxPort(cfg: MuxConfig): MuxPort {
  const client = new Mux({
    tokenId: cfg.tokenId,
    tokenSecret: cfg.tokenSecret,
    jwtSigningKey: cfg.signingKeyId,
    jwtPrivateKey: cfg.signingKeyPrivate,
    webhookSecret: cfg.webhookSecret,
  })

  return {
    async createDirectUpload({ passthrough, corsOrigin }) {
      const upload = await client.video.uploads.create({
        cors_origin: corsOrigin,
        new_asset_settings: { playback_policies: ["signed"], passthrough },
      })
      if (!upload.url) throw new Error("mux: direct upload returned no url")
      return { id: upload.id, url: upload.url }
    },
    async getUpload(uploadId) {
      try {
        const u = await client.video.uploads.retrieve(uploadId)
        return { status: u.status, assetId: u.asset_id ?? null }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },
    async getAsset(assetId) {
      try {
        const a = await client.video.assets.retrieve(assetId)
        const signed = a.playback_ids?.find((p) => p.policy === "signed")
        return {
          id: a.id,
          status: a.status,
          durationSec: typeof a.duration === "number" ? a.duration : null,
          signedPlaybackId: signed?.id ?? null,
        }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },
    signToken({ playbackId, audience, ttlSeconds }) {
      return client.jwt.signPlaybackId(playbackId, {
        type: audience === "v" ? "video" : "thumbnail",
        expiration: `${ttlSeconds}s`,
      })
    },
    async unwrapWebhook(rawBody, headers, secret) {
      const event = await client.webhooks.unwrap(rawBody, headers, secret)
      return event as unknown as MuxWebhookEnvelope
    },
  }
}

let override: MuxPort | null = null
let real: { key: string; port: MuxPort } | null = null

export function getMuxPort(): MuxPort {
  if (override) return override
  const cfg = muxConfig()
  const key = JSON.stringify(cfg)
  if (!real || real.key !== key) real = { key, port: createRealMuxPort(cfg) }
  return real.port
}

/** Test-only. Pass `null` to restore the real port. */
export function setMuxPortForTests(port: MuxPort | null): void {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    throw new Error("setMuxPortForTests is test-only")
  }
  override = port
}
