import { createHmac } from "node:crypto"

import { jwtSign } from "payload"
import type { Payload } from "payload"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { makeCourse, makeCustomer, makeLesson, makeStaff } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { grantEntitlement, revokeEntitlement } from "@/modules/access"
import { getLessonVideoRef, recordLessonVideo } from "@/modules/catalog"
import { setMuxPortForTests } from "../server/mux-port"

const ORIGIN = "http://localhost:3000"
const WEBHOOK_SECRET = "whsec_integration"

describe.skipIf(!hasTestDb)("video routes (integration, fake + mocked Mux)", () => {
  vi.setConfig({ testTimeout: 60_000 })
  let payload: Payload
  let playback: typeof import("@/app/api/video/playback/route")
  let webhook: typeof import("@/app/api/video/webhook/route")
  let uploads: typeof import("@/app/api/video/uploads/route")
  let uploadPoll: typeof import("@/app/api/video/uploads/[id]/route")
  let fakeRoute: typeof import("@/app/api/video/fake/route")
  let fakeUpload: typeof import("@/app/api/video/fake-upload/[id]/route")

  const saved: Record<string, string | undefined> = {}
  const setEnv = (k: string, v: string | undefined) => {
    if (!(k in saved)) saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    setEnv("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL || ORIGIN)
    playback = await import("@/app/api/video/playback/route")
    webhook = await import("@/app/api/video/webhook/route")
    uploads = await import("@/app/api/video/uploads/route")
    uploadPoll = await import("@/app/api/video/uploads/[id]/route")
    fakeRoute = await import("@/app/api/video/fake/route")
    fakeUpload = await import("@/app/api/video/fake-upload/[id]/route")
  }, 60_000)

  afterAll(() => {
    setMuxPortForTests(null)
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  const useFake = () => {
    setEnv("VIDEO_PROVIDER", "fake")
    setEnv("VIDEO_FAKE_ALLOWED", "true")
  }

  async function customerCookie(customer: { id: number; email: string }) {
    const { token } = await jwtSign({
      fieldsToSign: { id: customer.id, collection: "customers", email: customer.email, sessionVersion: 0 },
      secret: process.env.PAYLOAD_SECRET!,
      tokenExpiration: 3600,
    })
    return `payload-token=${token}`
  }

  async function staffCookie() {
    const password = `pw-${uid()}${uid()}`
    const staff = await makeStaff(payload, "staff")
    await payload.update({ collection: "users", id: staff.id, data: { password }, overrideAccess: true })
    const login = await payload.login({ collection: "users", data: { email: staff.email, password } })
    return `payload-token=${login.token}`
  }

  const get = (path: string, cookie?: string) =>
    new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} })

  async function readyLesson(opts: { status?: "draft" | "published"; isPreview?: boolean } = {}) {
    const course = await makeCourse(payload, "online", opts.status ?? "published")
    const lesson = await makeLesson(payload, course.id, 0)
    if (opts.isPreview) {
      await payload.update({ collection: "lessons", id: lesson.id, data: { isPreview: true }, overrideAccess: true })
    }
    await recordLessonVideo(lesson.id, {
      provider: "fake",
      assetId: `fakeasset_${uid()}`.replace(/[^A-Za-z0-9_]/g, ""),
      playbackId: "fakeplay_x",
      durationSec: 30,
      status: "ready",
    })
    return { course, lesson }
  }

  describe("GET /api/video/playback (fake)", () => {
    it("signed out -> 401, no-store", async () => {
      useFake()
      const { lesson } = await readyLesson()
      const res = await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`))
      expect(res.status).toBe(401)
      expect(res.headers.get("cache-control")).toBe("private, no-store")
    })

    it("entitled -> 200 signed URL that the fake route accepts; other customer -> 403", async () => {
      useFake()
      const { course, lesson } = await readyLesson()
      const owner = await makeCustomer(payload)
      const other = await makeCustomer(payload)
      await grantEntitlement({ customerId: owner.id, courseId: course.id, source: "manual", sourceRef: `t-${uid()}` })

      const ok = await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(owner)))
      expect(ok.status).toBe(200)
      expect(ok.headers.get("cache-control")).toBe("private, no-store")
      const body = (await ok.json()) as { ok: true; data: { url: string; expiresAt: string } }
      expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 3_500_000)

      const manifest = await fakeRoute.GET(new Request(body.data.url))
      expect(manifest.status).toBe(200)
      expect(await manifest.json()).toMatchObject({ fake: true })
      const tampered = new URL(body.data.url)
      tampered.searchParams.set("viewer", "999999")
      expect((await fakeRoute.GET(new Request(tampered))).status).toBe(403)

      const denied = await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(other)))
      expect(denied.status).toBe(403)
    })

    it("revoked and expired entitlements -> 403", async () => {
      useFake()
      const { course, lesson } = await readyLesson()
      const revoked = await makeCustomer(payload)
      const expired = await makeCustomer(payload)
      const ref = `t-${uid()}`
      await grantEntitlement({ customerId: revoked.id, courseId: course.id, source: "manual", sourceRef: ref })
      await revokeEntitlement({ customerId: revoked.id, courseId: course.id, source: "manual", sourceRef: ref, reason: "test" })
      await grantEntitlement({
        customerId: expired.id,
        courseId: course.id,
        source: "manual",
        sourceRef: `t-${uid()}`,
        validFrom: new Date(Date.now() - 2 * 86_400_000),
        validUntil: new Date(Date.now() - 86_400_000),
      })
      for (const c of [revoked, expired]) {
        const res = await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(c)))
        expect(res.status).toBe(403)
      }
    })

    it("preview lesson: signed-in non-entitled -> 200; signed out -> 401", async () => {
      useFake()
      const { lesson } = await readyLesson({ isPreview: true })
      const customer = await makeCustomer(payload)
      expect((await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(customer)))).status).toBe(200)
      expect((await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`))).status).toBe(401)
    })

    it("draft course -> 404 for customers (even preview), staff may play", async () => {
      useFake()
      const { lesson } = await readyLesson({ status: "draft", isPreview: true })
      const customer = await makeCustomer(payload)
      expect((await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(customer)))).status).toBe(404)
      expect((await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await staffCookie()))).status).toBe(200)
    })

    it("lesson without a ready video -> 404; bad lessonId -> 400", async () => {
      useFake()
      const course = await makeCourse(payload, "online")
      const lesson = await makeLesson(payload, course.id, 1)
      const customer = await makeCustomer(payload)
      await payload.update({ collection: "lessons", id: lesson.id, data: { isPreview: true }, overrideAccess: true })
      expect((await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(customer)))).status).toBe(404)
      expect((await playback.GET(get(`/api/video/playback?lessonId=abc`))).status).toBe(400)
    })

    it("VIDEO_PROVIDER=none -> 503", async () => {
      const { lesson } = await readyLesson({ isPreview: true })
      const customer = await makeCustomer(payload)
      setEnv("VIDEO_PROVIDER", "none")
      const res = await playback.GET(get(`/api/video/playback?lessonId=${lesson.id}`, await customerCookie(customer)))
      expect(res.status).toBe(503)
    })
  })

  describe("fake routes", () => {
    it("404 unless provider is fake", async () => {
      setEnv("VIDEO_PROVIDER", "none")
      expect((await fakeRoute.GET(get("/api/video/fake?asset=a&exp=1&viewer=1&sig=x"))).status).toBe(404)
      const res = await fakeUpload.PUT(new Request(`${ORIGIN}/api/video/fake-upload/x`, { method: "PUT", body: "x" }), {
        params: Promise.resolve({ id: "x" }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("staff upload flow (fake)", () => {
    it("create upload -> PUT -> poll -> lesson ready with assetId", async () => {
      useFake()
      const course = await makeCourse(payload, "online")
      const lesson = await makeLesson(payload, course.id, 0)
      const cookie = await staffCookie()

      const created = await uploads.POST(
        new Request(`${ORIGIN}/api/video/uploads`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ lessonId: lesson.id }),
        }),
      )
      expect(created.status).toBe(200)
      const { data } = (await created.json()) as { data: { uploadUrl: string; uploadId: string } }
      expect((await getLessonVideoRef(lesson.id))?.status).toBe("preparing")

      const preparing = await uploadPoll.GET(get(`/api/video/uploads/${data.uploadId}?lessonId=${lesson.id}`, cookie), {
        params: Promise.resolve({ id: data.uploadId }),
      })
      expect(((await preparing.json()) as { data: { status: string } }).data.status).toBe("preparing")

      const put = await fakeUpload.PUT(
        new Request(data.uploadUrl, { method: "PUT", headers: { cookie }, body: new Uint8Array(1024) }),
        { params: Promise.resolve({ id: data.uploadId }) },
      )
      expect(put.status).toBe(200)

      const polled = await uploadPoll.GET(get(`/api/video/uploads/${data.uploadId}?lessonId=${lesson.id}`, cookie), {
        params: Promise.resolve({ id: data.uploadId }),
      })
      const body = (await polled.json()) as { data: { status: string; assetId?: string; durationSec?: number } }
      expect(body.data.status).toBe("ready")
      expect(body.data.assetId).toMatch(/^fakeasset_/)
      const ref = await getLessonVideoRef(lesson.id)
      expect(ref).toMatchObject({ provider: "fake", status: "ready", uploadId: data.uploadId, assetId: body.data.assetId })
    })

    it("oversize fake upload -> 413; replaced upload id -> 404", async () => {
      useFake()
      const course = await makeCourse(payload, "online")
      const lesson = await makeLesson(payload, course.id, 0)
      const cookie = await staffCookie()
      const mk = async () =>
        (
          (await (
            await uploads.POST(
              new Request(`${ORIGIN}/api/video/uploads`, {
                method: "POST",
                headers: { cookie, "content-type": "application/json" },
                body: JSON.stringify({ lessonId: lesson.id }),
              }),
            )
          ).json()) as { data: { uploadUrl: string; uploadId: string } }
        ).data
      const first = await mk()
      const big = await fakeUpload.PUT(
        new Request(first.uploadUrl, { method: "PUT", headers: { cookie }, body: new Uint8Array(1024 * 1024 + 1) }),
        { params: Promise.resolve({ id: first.uploadId }) },
      )
      expect(big.status).toBe(413)
      await mk() // replaces the upload
      const stale = await fakeUpload.PUT(
        new Request(first.uploadUrl, { method: "PUT", headers: { cookie }, body: "x" }),
        { params: Promise.resolve({ id: first.uploadId }) },
      )
      expect(stale.status).toBe(404)
    })

    it("customers and anonymous cannot call upload routes (403 / 401)", async () => {
      useFake()
      const course = await makeCourse(payload, "online")
      const lesson = await makeLesson(payload, course.id, 0)
      const customer = await makeCustomer(payload)
      const post = (cookie?: string) =>
        uploads.POST(
          new Request(`${ORIGIN}/api/video/uploads`, {
            method: "POST",
            headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
            body: JSON.stringify({ lessonId: lesson.id }),
          }),
        )
      expect((await post()).status).toBe(401)
      expect((await post(await customerCookie(customer))).status).toBe(403)
      const poll = (cookie?: string) =>
        uploadPoll.GET(get(`/api/video/uploads/x?lessonId=${lesson.id}`, cookie), { params: Promise.resolve({ id: "x" }) })
      expect((await poll()).status).toBe(401)
      expect((await poll(await customerCookie(customer))).status).toBe(403)
      const put = (cookie?: string) =>
        fakeUpload.PUT(new Request(`${ORIGIN}/api/video/fake-upload/x`, { method: "PUT", headers: cookie ? { cookie } : {}, body: "x" }), {
          params: Promise.resolve({ id: "x" }),
        })
      expect((await put()).status).toBe(401)
      expect((await put(await customerCookie(customer))).status).toBe(403)
    })

    it("cross-origin POST is rejected", async () => {
      useFake()
      const res = await uploads.POST(
        new Request(`${ORIGIN}/api/video/uploads`, {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "application/json" },
          body: JSON.stringify({ lessonId: 1 }),
        }),
      )
      expect(res.status).toBe(403)
    })
  })

  describe("POST /api/video/webhook (Mux, mocked port)", () => {
    const signed = (body: string, ts = Math.floor(Date.now() / 1000)) =>
      new Request(`${ORIGIN}/api/video/webhook`, {
        method: "POST",
        headers: { "mux-signature": `t=${ts},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex")}` },
        body,
      })

    function useMux() {
      setEnv("VIDEO_PROVIDER", "mux")
      setEnv("MUX_TOKEN_ID", "id")
      setEnv("MUX_TOKEN_SECRET", "secret")
      setEnv("MUX_SIGNING_KEY_ID", "kid")
      setEnv("MUX_SIGNING_KEY_PRIVATE", "unused-in-webhook-tests")
      setEnv("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET)
      // Signature verification stays real (local HMAC); only network calls are stubbed, and none are made.
      setMuxPortForTests(null)
    }

    it("created -> ready updates the lesson via catalog; replay is a no-op", async () => {
      // Real crypto path needs a parseable RSA key only for signing; webhooks do not sign.
      useMux()
      const course = await makeCourse(payload, "online")
      const lesson = await makeLesson(payload, course.id, 0)
      await recordLessonVideo(lesson.id, { provider: "mux", uploadId: "up_1", status: "preparing" })

      const created = JSON.stringify({
        type: "video.upload.asset_created",
        data: { id: "up_1", asset_id: "as_1", new_asset_settings: { passthrough: String(lesson.id) } },
      })
      const r1 = await webhook.POST(signed(created))
      expect(r1.status).toBe(200)
      expect(await getLessonVideoRef(lesson.id)).toMatchObject({ status: "preparing", assetId: "as_1", uploadId: "up_1", provider: "mux" })

      const ready = JSON.stringify({
        type: "video.asset.ready",
        data: { id: "as_1", passthrough: String(lesson.id), upload_id: "up_1", duration: 61.4, playback_ids: [{ id: "pb_1", policy: "signed" }] },
      })
      expect((await webhook.POST(signed(ready))).status).toBe(200)
      expect(await getLessonVideoRef(lesson.id)).toMatchObject({ status: "ready", assetId: "as_1", playbackId: "pb_1", durationSec: 61 })

      // Replays (ready twice, late asset_created) change nothing.
      const before = await getLessonVideoRef(lesson.id)
      const replayReady = (await (await webhook.POST(signed(ready))).json()) as { data: { outcome: string } }
      const replayCreated = (await (await webhook.POST(signed(created))).json()) as { data: { outcome: string } }
      expect(replayReady.data.outcome).toBe("noop")
      expect(replayCreated.data.outcome).toBe("noop")
      expect(await getLessonVideoRef(lesson.id)).toEqual(before)
    })

    it("errored event; stale asset of a replaced upload is dropped", async () => {
      useMux()
      const course = await makeCourse(payload, "online")
      const lesson = await makeLesson(payload, course.id, 0)
      await recordLessonVideo(lesson.id, { provider: "mux", uploadId: "up_new", status: "preparing", assetId: null })
      const stale = JSON.stringify({
        type: "video.asset.ready",
        data: { id: "as_old", passthrough: String(lesson.id), upload_id: "up_old", playback_ids: [{ id: "pb", policy: "signed" }] },
      })
      expect(((await (await webhook.POST(signed(stale))).json()) as { data: { outcome: string } }).data.outcome).toBe("stale")
      expect((await getLessonVideoRef(lesson.id))?.status).toBe("preparing")

      const errored = JSON.stringify({
        type: "video.asset.errored",
        data: { id: "as_new", passthrough: String(lesson.id), upload_id: "up_new" },
      })
      expect((await webhook.POST(signed(errored))).status).toBe(200)
      expect(await getLessonVideoRef(lesson.id)).toMatchObject({ status: "errored", assetId: "as_new" })
    })

    it("unknown lesson -> 200; unrelated event -> 200", async () => {
      useMux()
      const unknown = JSON.stringify({ type: "video.asset.ready", data: { id: "as_x", passthrough: "999999999" } })
      const res = await webhook.POST(signed(unknown))
      expect(res.status).toBe(200)
      expect(((await res.json()) as { data: { outcome: string } }).data.outcome).toBe("unknown_lesson")
      const other = JSON.stringify({ type: "video.asset.updated", data: {} })
      expect(((await (await webhook.POST(signed(other))).json()) as { data: { outcome: string } }).data.outcome).toBe("ignored")
    })

    it("bad signature -> 403; stale timestamp -> 403; no secret -> 503; provider none -> 503", async () => {
      useMux()
      const body = JSON.stringify({ type: "video.asset.ready", data: {} })
      const bad = new Request(`${ORIGIN}/api/video/webhook`, { method: "POST", headers: { "mux-signature": "t=1,v1=00" }, body })
      expect((await webhook.POST(bad)).status).toBe(403)
      expect((await webhook.POST(signed(body, Math.floor(Date.now() / 1000) - 3600))).status).toBe(403)
      setEnv("MUX_WEBHOOK_SECRET", undefined)
      expect((await webhook.POST(signed(body))).status).toBe(503)
      setEnv("VIDEO_PROVIDER", "none")
      expect((await webhook.POST(signed(body))).status).toBe(503)
    })
  })
})

