import { createHmac, createVerify, generateKeyPairSync } from "node:crypto"

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { clampTtl } from "../types"
import { createRealMuxPort, type MuxPort } from "../server/mux-port"
import { createMuxProvider, mapMuxEvent } from "../server/providers/mux"

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
}) as { publicKey: string; privateKey: string }
const KEY_ID = "test-kid-1"

const b64 = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Record<string, unknown>
/** Verify an RS256 JWT with the test public key; returns header + payload. */
function verifyJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p, sig] = token.split(".") as [string, string, string]
  const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, "base64url"))
  if (!ok) throw new Error("bad jwt signature")
  return { header: b64(h), payload: b64(p) }
}
const WEBHOOK_SECRET = "whsec_test_secret"
const baseCfg = {
  tokenId: "id",
  tokenSecret: "secret",
  signingKeyId: KEY_ID,
  signingKeyPrivate: Buffer.from(privateKey).toString("base64"),
  webhookSecret: WEBHOOK_SECRET,
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test"
  process.env.MUX_TOKEN_ID = "id"
  process.env.MUX_TOKEN_SECRET = "secret"
  process.env.MUX_SIGNING_KEY_ID = KEY_ID
  process.env.MUX_SIGNING_KEY_PRIVATE = baseCfg.signingKeyPrivate
  process.env.MUX_WEBHOOK_SECRET = WEBHOOK_SECRET
})
afterEach(() => vi.useRealTimers())

describe("clampTtl", () => {
  it("clamps to [60, 7200] and defaults non-finite to 3600", () => {
    expect(clampTtl(10)).toBe(60)
    expect(clampTtl(99_999)).toBe(7200)
    expect(clampTtl(3600)).toBe(3600)
    expect(clampTtl(Number.NaN)).toBe(3600)
  })
})

describe("Mux playback JWT (real SDK signing, generated RSA key)", () => {
  it("signs sub/aud/exp with kid header; poster uses aud=t; url shape", async () => {
    const provider = createMuxProvider(createRealMuxPort(baseCfg))
    const before = Math.floor(Date.now() / 1000)
    const res = await provider.getPlayback({ assetId: "a1", playbackId: "pb1", viewerId: "9", ttlSeconds: 3600 })

    const url = new URL(res.url)
    expect(`${url.origin}${url.pathname}`).toBe("https://stream.mux.com/pb1.m3u8")
    const token = url.searchParams.get("token")!
    const { header, payload } = verifyJwt(token)
    expect(header).toMatchObject({ alg: "RS256", typ: "JWT" })
    // @mux/mux-node 15.5.0 carries the signing key id as the `kid` claim (Mux's documented token shape).
    expect(payload.kid).toBe(KEY_ID)
    expect(payload.sub).toBe("pb1")
    expect(payload.aud).toBe("v")
    expect(payload.exp as number).toBeGreaterThanOrEqual(before + 3600 - 2)
    expect(payload.exp as number).toBeLessThanOrEqual(before + 3600 + 5)

    const poster = new URL(res.posterUrl!)
    expect(`${poster.origin}${poster.pathname}`).toBe("https://image.mux.com/pb1/thumbnail.jpg")
    const { payload: tp } = verifyJwt(poster.searchParams.get("token")!)
    expect(tp.aud).toBe("t")
    expect(tp.sub).toBe("pb1")
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now() + 3500_000)
  })

  it("clamps an oversize TTL to 2 h", async () => {
    const provider = createMuxProvider(createRealMuxPort(baseCfg))
    const res = await provider.getPlayback({ assetId: "a1", playbackId: "pb1", viewerId: "9", ttlSeconds: 86_400 })
    const { payload } = verifyJwt(new URL(res.url).searchParams.get("token")!)
    expect((payload.exp as number) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(7200)
  })

  it("throws when the asset has no signed playback id", async () => {
    const provider = createMuxProvider(createRealMuxPort(baseCfg))
    await expect(provider.getPlayback({ assetId: "a1", viewerId: "9", ttlSeconds: 60 })).rejects.toThrow(/playback id/)
  })
})

describe("Mux webhook verification (documented scheme: t=<ts>,v1=HMAC-SHA256(secret, `${t}.${body}`))", () => {
  const body = JSON.stringify({
    type: "video.asset.ready",
    data: { id: "asset1", passthrough: "42", upload_id: "up1", duration: 12.4, playback_ids: [{ id: "pbS", policy: "signed" }, { id: "pbP", policy: "public" }] },
  })
  const header = (ts: number, secret = WEBHOOK_SECRET, payload = body) =>
    new Headers({ "mux-signature": `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex")}` })
  const now = () => Math.floor(Date.now() / 1000)
  const provider = () => createMuxProvider(createRealMuxPort(baseCfg))

  it("accepts a valid signature and maps the event", async () => {
    const r = await provider().verifyWebhook(body, header(now()))
    expect(r).toEqual({
      ok: true,
      data: { type: "asset.ready", lessonId: "42", uploadId: "up1", assetId: "asset1", playbackId: "pbS", durationSec: 12 },
    })
  })

  it("rejects a wrong secret, tampered body, missing header", async () => {
    expect(await provider().verifyWebhook(body, header(now(), "other"))).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
    expect(await provider().verifyWebhook(body + " ", header(now()))).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
    expect(await provider().verifyWebhook(body, new Headers())).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
  })

  it("rejects a stale timestamp (> 5 min) even with a correct signature", async () => {
    expect(await provider().verifyWebhook(body, header(now() - 301))).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
    expect((await provider().verifyWebhook(body, header(now() - 250))).ok).toBe(true)
  })

  it("no webhook secret configured -> UPSTREAM not_configured", async () => {
    const saved = process.env.MUX_WEBHOOK_SECRET
    delete process.env.MUX_WEBHOOK_SECRET
    try {
      expect(await provider().verifyWebhook(body, header(now()))).toEqual({
        ok: false,
        error: { code: "UPSTREAM", service: "video", message: "not_configured" },
      })
    } finally {
      process.env.MUX_WEBHOOK_SECRET = saved
    }
  })
})

describe("mapMuxEvent", () => {
  it("upload.asset_created reads passthrough from new_asset_settings", () => {
    expect(
      mapMuxEvent({ type: "video.upload.asset_created", data: { id: "up1", asset_id: "as1", new_asset_settings: { passthrough: "7" } } }),
    ).toEqual({ type: "upload.asset_created", lessonId: "7", uploadId: "up1", assetId: "as1" })
  })
  it("asset.errored and unknown types", () => {
    expect(mapMuxEvent({ type: "video.asset.errored", data: { id: "as1", passthrough: "7" } })).toMatchObject({ type: "asset.errored", lessonId: "7", assetId: "as1" })
    expect(mapMuxEvent({ type: "video.asset.updated", data: {} })).toEqual({ type: "ignored" })
  })
})

describe("Mux adapter over a fake port", () => {
  const fakePort = (over: Partial<MuxPort>): MuxPort => ({
    createDirectUpload: vi.fn(async () => ({ id: "up1", url: "https://storage.example/upload" })),
    getUpload: vi.fn(async () => null),
    getAsset: vi.fn(async () => null),
    signToken: vi.fn(async () => "tok"),
    unwrapWebhook: vi.fn(),
    ...over,
  })

  it("createUpload passes lessonId as passthrough and SITE_URL as CORS origin", async () => {
    const port = fakePort({})
    const r = await createMuxProvider(port).createUpload({ lessonId: "5" })
    expect(r).toEqual({ uploadId: "up1", uploadUrl: "https://storage.example/upload" })
    expect(port.createDirectUpload).toHaveBeenCalledWith({ passthrough: "5", corsOrigin: "https://example.test" })
  })

  it("getAsset resolves an upload id through to its asset", async () => {
    const port = fakePort({
      getAsset: vi.fn(async (id: string) =>
        id === "as1" ? { id: "as1", status: "ready", durationSec: 11.6, signedPlaybackId: "pb" } : null,
      ),
      getUpload: vi.fn(async () => ({ status: "asset_created", assetId: "as1" })),
    })
    expect(await createMuxProvider(port).getAsset("up1")).toEqual({ assetId: "as1", playbackId: "pb", status: "ready", durationSec: 12 })
  })

  it("getAsset: waiting upload = preparing without asset; errored upload = errored", async () => {
    const waiting = fakePort({ getUpload: vi.fn(async () => ({ status: "waiting", assetId: null })) })
    expect(await createMuxProvider(waiting).getAsset("up1")).toEqual({ assetId: "", status: "preparing" })
    const errored = fakePort({ getUpload: vi.fn(async () => ({ status: "errored", assetId: null })) })
    expect(await createMuxProvider(errored).getAsset("up1")).toEqual({ assetId: "", status: "errored" })
  })
})
