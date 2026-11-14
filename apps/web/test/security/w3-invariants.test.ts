/**
 * W3-10 security review — regression guards for Wave 3 invariants (PASS items)
 * plus a proof-of-concept for M-1 (marked `.fails` until the fix lands).
 * Pure unit tests: no database, no network.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { catalogCollections } from "@/modules/catalog"
import { PLAYBACK_TTL_SECONDS, fakeEnabled, getVideoProvider, verifyFake } from "@/modules/video"

// Public module surfaces only (no deep imports). Code entropy, `next` sanitizing
// and the 300 s material TTL are covered by the owning modules' own tests
// (commerce seats-unit, learning codes-unique / materials-access, identity next-path).
const Lessons = catalogCollections.find((c) => c.slug === "lessons")!

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe("W3-10 video: fake provider is opt-in only", () => {
  beforeEach(() => {
    process.env.PAYLOAD_SECRET = "p".repeat(40)
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test"
  })

  it("VIDEO_PROVIDER=fake without VIDEO_FAKE_ALLOWED=true → no provider", () => {
    process.env.VIDEO_PROVIDER = "fake"
    delete process.env.VIDEO_FAKE_ALLOWED
    expect(fakeEnabled()).toBe(false)
    expect(getVideoProvider()).toBeNull()
    process.env.VIDEO_FAKE_ALLOWED = "1"
    expect(fakeEnabled()).toBe(false)
  })

  it("VIDEO_FAKE_ALLOWED=true alone never enables fake under another provider", () => {
    process.env.VIDEO_FAKE_ALLOWED = "true"
    for (const p of ["none", "mux", "bunny", "", "FAKE"]) {
      process.env.VIDEO_PROVIDER = p
      expect(fakeEnabled()).toBe(false)
    }
  })

  it("fake signed URL is bound to the viewer and the asset, TTL clamped to ≤ 2 h", async () => {
    process.env.VIDEO_PROVIDER = "fake"
    process.env.VIDEO_FAKE_ALLOWED = "true"
    const provider = getVideoProvider()!
    const res = await provider.getPlayback({ assetId: "fakeasset_a", viewerId: "12", ttlSeconds: 1e12 })
    const q = new URL(res.url).searchParams
    const exp = Number(q.get("exp"))
    const sig = q.get("sig")!
    const secret = process.env.PAYLOAD_SECRET!
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(7200)
    expect(verifyFake(secret, { assetId: "fakeasset_a", exp, viewerId: "12", sig }).ok).toBe(true)
    expect(verifyFake(secret, { assetId: "fakeasset_a", exp, viewerId: "13", sig }).ok).toBe(false)
    expect(verifyFake(secret, { assetId: "fakeasset_b", exp, viewerId: "12", sig }).ok).toBe(false)
    expect(verifyFake(secret, { assetId: "fakeasset_a", exp: exp + 1, viewerId: "12", sig }).ok).toBe(false)
  })

  it("default playback TTL ≤ 2 h", () => {
    expect(PLAYBACK_TTL_SECONDS).toBeLessThanOrEqual(7200)
  })
})

// ---------------------------------------------------------------------------
// Service worker: run public/sw.js in a sandbox and check what it caches.
// ---------------------------------------------------------------------------

type FetchEvent = { request: FakeRequest; respondWith: (p: Promise<unknown>) => void }
type FakeRequest = { url: string; method: string; mode: string; headers: Map<string, string> }

function loadServiceWorker() {
  const src = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8")
  const listeners: Record<string, (e: unknown) => void> = {}
  const puts: string[] = []
  const cache = {
    match: async () => undefined,
    put: async (req: FakeRequest) => {
      puts.push(new URL(req.url).pathname)
    },
    addAll: async () => undefined,
  }
  const context = {
    self: {
      location: { origin: "https://site.test" },
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners[type] = fn
      },
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    },
    caches: { open: async () => cache, keys: async () => [], match: async () => undefined, delete: async () => true },
    fetch: async () => ({ ok: true, type: "basic", clone: () => ({}) }),
    URL,
    Response: { error: () => ({ error: true }) },
    Promise,
  }
  vm.runInNewContext(src, context)
  return { listeners, puts }
}

async function dispatch(sw: ReturnType<typeof loadServiceWorker>, url: string, init: Partial<FakeRequest> = {}) {
  let responded: Promise<unknown> | null = null
  const event: FetchEvent = {
    request: { url, method: "GET", mode: "no-cors", headers: new Map(), ...init },
    respondWith: (p) => {
      responded = p
    },
  }
  sw.listeners.fetch!(event)
  if (responded) await responded
  return responded !== null
}

describe("W3-10 service worker never caches authenticated content", () => {
  it.each([
    "https://site.test/api/video/playback?lessonId=1",
    "https://site.test/api/materials/1",
    "https://site.test/api/certificates/1/pdf",
    "https://site.test/api/users/me",
    "https://site.test/fr/compte",
    "https://site.test/en/account/courses/x/1?_rsc=abc",
    "https://site.test/admin",
  ])("does not intercept or cache %s", async (url) => {
    const sw = loadServiceWorker()
    const intercepted = await dispatch(sw, url)
    expect(intercepted).toBe(false)
    expect(sw.puts).toEqual([])
  })

  it("navigations are network-only (never stored)", async () => {
    const sw = loadServiceWorker()
    await dispatch(sw, "https://site.test/fr/compte", { mode: "navigate" })
    expect(sw.puts).toEqual([])
  })

  it("non-GET and cross-origin requests are ignored", async () => {
    const sw = loadServiceWorker()
    expect(await dispatch(sw, "https://site.test/_next/static/a.js", { method: "POST" })).toBe(false)
    expect(await dispatch(sw, "https://stream.mux.com/x.m3u8?token=t")).toBe(false)
    expect(sw.puts).toEqual([])
  })

  it("caches hashed static assets only", async () => {
    const sw = loadServiceWorker()
    await dispatch(sw, "https://site.test/_next/static/chunks/a.js")
    expect(sw.puts).toEqual(["/_next/static/chunks/a.js"])
  })
})

// ---------------------------------------------------------------------------
// M-1 PoC (W3-02): the admin lesson form posts the `video` group it loaded.
// A staff save during/after an upload rewrites video.* with stale values
// (uploadId/assetId/status), so the provider webhook for the new upload is
// then dropped as "stale". Fix: deny `update`/`create` field access on the
// `video` group (writes go through catalog `recordLessonVideo`, which uses
// `payload.db.updateOne` and is unaffected). Remove `.fails` once fixed.
// ---------------------------------------------------------------------------

describe("W3-10 M-1 lessons.video is not writable through the admin form / REST", () => {
  it.fails("video group denies update + create field access", async () => {
    const video = Lessons.fields.find((f) => "name" in f && f.name === "video") as {
      access?: { update?: (a: unknown) => unknown; create?: (a: unknown) => unknown }
    }
    expect(video).toBeDefined()
    const staffArgs = { req: { user: { id: 1, collection: "users", roles: ["admin"] } } }
    expect(await video.access?.update?.(staffArgs)).toBe(false)
    expect(await video.access?.create?.(staffArgs)).toBe(false)
  })
})
