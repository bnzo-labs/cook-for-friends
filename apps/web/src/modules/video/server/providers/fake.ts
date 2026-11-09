import { randomBytes } from "node:crypto"

import type { Result } from "@/modules/_shared"

import { type VideoProvider, type VideoWebhookEvent, clampTtl } from "../../types"
import { payloadSecret, siteUrl } from "../config"
import { signFake } from "../fake-token"

/**
 * Fake adapter: real code, non-prod only (VIDEO_FAKE_ALLOWED). Stateless so it
 * works across serverless instances: the upload id encodes the lesson, the
 * asset id is derived from the upload id, and the PUT route records the result
 * on the lesson directly.
 */
export const FAKE_UPLOAD_PREFIX = "fakeup_"
export const FAKE_ASSET_PREFIX = "fakeasset_"
export const FAKE_PLAYBACK_PREFIX = "fakeplay_"

const UPLOAD_RE = /^fakeup_([A-Za-z0-9-]+)_([a-f0-9]{16})$/

export function parseFakeUploadId(uploadId: string): { lessonId: string; nonce: string } | null {
  const m = UPLOAD_RE.exec(uploadId)
  return m?.[1] && m[2] ? { lessonId: m[1], nonce: m[2] } : null
}

export const fakeAssetIdFor = (nonce: string): string => `${FAKE_ASSET_PREFIX}${nonce}`
export const fakePlaybackIdFor = (nonce: string): string => `${FAKE_PLAYBACK_PREFIX}${nonce}`

export function createFakeProvider(): VideoProvider {
  return {
    name: "fake",

    async getPlayback({ assetId, viewerId, ttlSeconds }) {
      const ttl = clampTtl(ttlSeconds)
      const exp = Math.floor(Date.now() / 1000) + ttl
      const sig = signFake(payloadSecret(), { assetId, exp, viewerId })
      const q = new URLSearchParams({ asset: assetId, exp: String(exp), viewer: viewerId, sig })
      return {
        url: `${siteUrl()}/api/video/fake?${q.toString()}`,
        expiresAt: new Date(exp * 1000).toISOString(),
      }
    },

    async createUpload({ lessonId }) {
      if (!/^[A-Za-z0-9-]+$/.test(lessonId)) throw new Error("fake: invalid lesson id")
      const uploadId = `${FAKE_UPLOAD_PREFIX}${lessonId}_${randomBytes(8).toString("hex")}`
      return { uploadId, uploadUrl: `${siteUrl()}/api/video/fake-upload/${uploadId}` }
    },

    async getAsset(assetIdOrUploadId) {
      const upload = parseFakeUploadId(assetIdOrUploadId)
      // An upload is only "ready" once the PUT route recorded it on the lesson
      // (the poll route reads that first); until then there is no asset yet.
      if (upload) return { assetId: "", status: "preparing" }
      if (assetIdOrUploadId.startsWith(FAKE_ASSET_PREFIX)) {
        const nonce = assetIdOrUploadId.slice(FAKE_ASSET_PREFIX.length)
        return { assetId: assetIdOrUploadId, playbackId: fakePlaybackIdFor(nonce), status: "ready" }
      }
      throw new Error("fake: unknown asset id")
    },

    async verifyWebhook(): Promise<Result<VideoWebhookEvent>> {
      return { ok: false, error: { code: "FORBIDDEN" } }
    },
  }
}
