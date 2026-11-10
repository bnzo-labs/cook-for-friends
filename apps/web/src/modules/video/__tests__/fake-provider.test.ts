import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { verifyFake } from "../server/fake-token"
import { createFakeProvider, parseFakeUploadId } from "../server/providers/fake"
import { getVideoProvider } from "../server/provider"

const SECRET = "p".repeat(40)
const saved = { ...process.env }

beforeEach(() => {
  process.env.PAYLOAD_SECRET = SECRET
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/"
})
afterEach(() => {
  process.env = { ...saved }
})

describe("fake provider", () => {
  it("getPlayback returns a URL the verifier accepts (and clamps TTL)", async () => {
    const res = await createFakeProvider().getPlayback({ assetId: "fakeasset_ab", viewerId: "12", ttlSeconds: 99_999 })
    const url = new URL(res.url)
    expect(`${url.origin}${url.pathname}`).toBe("https://example.test/api/video/fake")
    const exp = Number(url.searchParams.get("exp"))
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(7200)
    expect(
      verifyFake(SECRET, {
        assetId: url.searchParams.get("asset")!,
        exp,
        viewerId: url.searchParams.get("viewer")!,
        sig: url.searchParams.get("sig")!,
      }),
    ).toEqual({ ok: true })
    expect(new Date(res.expiresAt).getTime()).toBe(exp * 1000)
  })

  it("createUpload encodes the lesson and points at the fake PUT route", async () => {
    const r = await createFakeProvider().createUpload({ lessonId: "42" })
    expect(r.uploadUrl).toBe(`https://example.test/api/video/fake-upload/${r.uploadId}`)
    expect(parseFakeUploadId(r.uploadId)).toMatchObject({ lessonId: "42" })
    await expect(createFakeProvider().createUpload({ lessonId: "4/../2" })).rejects.toThrow()
    expect(parseFakeUploadId("fakeup_42_zz")).toBeNull()
  })

  it("getAsset: upload ids stay preparing, asset ids are ready, junk throws; webhook is refused", async () => {
    const p = createFakeProvider()
    const { uploadId } = await p.createUpload({ lessonId: "1" })
    expect(await p.getAsset(uploadId)).toEqual({ assetId: "", status: "preparing" })
    expect(await p.getAsset("fakeasset_abc")).toMatchObject({ assetId: "fakeasset_abc", status: "ready" })
    await expect(p.getAsset("nope")).rejects.toThrow()
    expect(await p.verifyWebhook("{}", new Headers())).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
  })
})

describe("getVideoProvider", () => {
  it("none/unset -> null; bunny -> null (adapter not built)", () => {
    delete process.env.VIDEO_PROVIDER
    expect(getVideoProvider()).toBeNull()
    process.env.VIDEO_PROVIDER = "none"
    expect(getVideoProvider()).toBeNull()
    process.env.VIDEO_PROVIDER = "bunny"
    expect(getVideoProvider()).toBeNull()
  })

  it("fake needs VIDEO_FAKE_ALLOWED=true", () => {
    process.env.VIDEO_PROVIDER = "fake"
    delete process.env.VIDEO_FAKE_ALLOWED
    expect(getVideoProvider()).toBeNull()
    process.env.VIDEO_FAKE_ALLOWED = "true"
    expect(getVideoProvider()?.name).toBe("fake")
  })
})
