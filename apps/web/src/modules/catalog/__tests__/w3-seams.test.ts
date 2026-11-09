import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeLesson, makeSession } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import {
  getCourseLessonsContent,
  getLessonVideoRef,
  getMaterialDownload,
  listCoursesByIds,
  listSessionsStartingBetween,
  recordLessonVideo,
} from "../index"
import { buildVideoData } from "../server/lessons"
import { mediaStorageKey } from "../server/materials"

describe("catalog W3 seams (pure)", () => {
  it("buildVideoData always sets status and only the supplied keys", () => {
    expect(buildVideoData({ status: "preparing", uploadId: "u1" })).toEqual({
      video: { status: "preparing", uploadId: "u1" },
    })
    expect(buildVideoData({ status: "ready", provider: "fake", assetId: "a", playbackId: "p", durationSec: 12 })).toEqual({
      video: { status: "ready", provider: "fake", assetId: "a", playbackId: "p", durationSec: 12 },
    })
  })

  it("mediaStorageKey respects prefix and trims slashes", () => {
    expect(mediaStorageKey({ filename: "r.pdf" })).toBe("r.pdf")
    expect(mediaStorageKey({ filename: "r.pdf", prefix: "media" })).toBe("media/r.pdf")
    expect(mediaStorageKey({ filename: "r.pdf", prefix: "/a/b/" })).toBe("a/b/r.pdf")
    expect(mediaStorageKey({ prefix: "x" })).toBeNull()
  })
})

const HOUR = 3_600_000

describe.skipIf(!hasTestDb)("catalog W3 seams (integration)", { timeout: 60_000 }, () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  async function courseWithEn(status: "draft" | "published" | "archived", format: "online" | "in_person" = "online") {
    const k = uid()
    const doc = await payload.create({
      collection: "courses",
      locale: "fr",
      overrideAccess: true,
      data: {
        title: `Cours ${k}`,
        slug: `cours-${k}`,
        summary: `Résumé ${k}`,
        format,
        price: 5000,
        status,
        _status: status === "draft" ? "draft" : "published",
      },
    })
    return { doc, k }
  }

  async function material(kind: "recipe" | "pdf" | "other" = "pdf", locale?: "fr" | "en") {
    const media = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: "x" },
      file: { data: Buffer.from("%PDF-1.4 test"), name: `mat-${uid()}.pdf`, mimetype: "application/pdf", size: 13 },
    })
    return payload.create({
      collection: "materials",
      overrideAccess: true,
      data: { title: `Mat ${uid()}`, file: media.id, kind, ...(locale ? { locale } : {}) },
    })
  }

  describe("listCoursesByIds", () => {
    it("keeps input order, drops draft/archived/unknown, collapses duplicates", async () => {
      const a = await courseWithEn("published")
      const b = await courseWithEn("published")
      const draft = await courseWithEn("draft")
      const archived = await courseWithEn("archived")
      const ids = [b.doc.id, draft.doc.id, 2_000_000_001, a.doc.id, archived.doc.id, b.doc.id]
      const cards = await listCoursesByIds(ids, "fr")
      expect(cards.map((c) => c.id)).toEqual([b.doc.id, a.doc.id])
      expect(await listCoursesByIds([], "fr")).toEqual([])
    })

    it("flags locale fallback when EN copy is missing", async () => {
      const c = await courseWithEn("published")
      const [fr] = await listCoursesByIds([c.doc.id], "fr")
      const [en] = await listCoursesByIds([c.doc.id], "en")
      expect(fr?.isLocaleFallback).toBe(false)
      expect(en?.isLocaleFallback).toBe(true)
      expect(en?.title).toBe(`Cours ${c.k}`)
    })
  })

  describe("lessons", () => {
    it("getCourseLessonsContent: ordered, materials, video summary without raw ids", async () => {
      const c = await courseWithEn("published")
      const l2 = await makeLesson(payload, c.doc.id, 2)
      const l0 = await makeLesson(payload, c.doc.id, 0)
      const l1 = await makeLesson(payload, c.doc.id, 1)
      const m = await material("recipe", "fr")
      await payload.update({
        collection: "lessons",
        id: l1.id,
        overrideAccess: true,
        data: { materials: [m.id], video: { provider: "fake", assetId: "asset-secret", playbackId: "play-secret", durationSec: 90, status: "ready" } },
      })
      const out = await getCourseLessonsContent(c.doc.id, "fr")
      expect(out.map((l) => l.id)).toEqual([l0.id, l1.id, l2.id])
      const mid = out[1]!
      expect(mid.video).toEqual({ status: "ready", durationSec: 90 })
      expect(JSON.stringify(out)).not.toMatch(/asset-secret|play-secret|assetId|playbackId/)
      expect(mid.materials).toEqual([{ id: m.id, title: expect.any(String), kind: "recipe", locale: "fr" }])
      expect(out[0]!.video).toBeNull()
      expect(mid.courseId).toBe(c.doc.id)
    })

    it("getCourseLessonsContent: [] for draft, archived and unknown courses", async () => {
      const d = await courseWithEn("draft")
      await makeLesson(payload, d.doc.id, 0)
      const a = await courseWithEn("archived")
      await makeLesson(payload, a.doc.id, 0)
      expect(await getCourseLessonsContent(d.doc.id, "fr")).toEqual([])
      expect(await getCourseLessonsContent(a.doc.id, "fr")).toEqual([])
      expect(await getCourseLessonsContent(2_000_000_002, "fr")).toEqual([])
    })

    it("getLessonVideoRef returns ids and course status, any status", async () => {
      const c = await courseWithEn("draft")
      const l = await makeLesson(payload, c.doc.id, 0)
      expect(await getLessonVideoRef(l.id)).toMatchObject({
        lessonId: l.id,
        courseId: c.doc.id,
        courseStatus: "draft",
        provider: null,
        assetId: null,
        status: "none",
        isPreview: false,
      })
      await recordLessonVideo(l.id, { status: "ready", provider: "fake", assetId: "a1", playbackId: "p1", uploadId: "u1", durationSec: 42 })
      expect(await getLessonVideoRef(l.id)).toMatchObject({
        provider: "fake",
        assetId: "a1",
        playbackId: "p1",
        uploadId: "u1",
        durationSec: 42,
        status: "ready",
      })
      expect(await getLessonVideoRef(2_000_000_003)).toBeNull()
    })

    it("lessons.video provider 'fake' + status round-trip through the Local API", async () => {
      const c = await courseWithEn("published")
      const l = await payload.create({
        collection: "lessons",
        overrideAccess: true,
        data: { course: c.doc.id, title: "T", order: 0, video: { provider: "fake", status: "preparing", uploadId: "up-1" } },
      })
      const read = await payload.findByID({ collection: "lessons", id: l.id, overrideAccess: true })
      expect(read.video).toMatchObject({ provider: "fake", status: "preparing", uploadId: "up-1" })
      const plain = await makeLesson(payload, c.doc.id, 1)
      const readPlain = await payload.findByID({ collection: "lessons", id: plain.id, overrideAccess: true })
      expect(readPlain.video?.status).toBe("none")
    })

    it("recordLessonVideo changes only video fields; no course version, title/body kept", async () => {
      const c = await courseWithEn("published")
      const l = await payload.create({
        collection: "lessons",
        overrideAccess: true,
        locale: "fr",
        data: { course: c.doc.id, title: "Titre FR", order: 3, isPreview: true },
      })
      await payload.update({ collection: "lessons", id: l.id, locale: "en", overrideAccess: true, data: { title: "Title EN" } })
      const versionsBefore = await payload.countVersions({ collection: "courses", where: { parent: { equals: c.doc.id } }, overrideAccess: true })
      const before = await payload.findByID({ collection: "lessons", id: l.id, locale: "all", overrideAccess: true })

      await recordLessonVideo(l.id, { status: "preparing", provider: "fake", uploadId: "u-9" })
      // Partial follow-up must not clear earlier fields.
      await recordLessonVideo(l.id, { status: "ready", assetId: "a-9", playbackId: "p-9", durationSec: 7 })

      const after = await payload.findByID({ collection: "lessons", id: l.id, locale: "all", overrideAccess: true })
      expect(after.title).toEqual(before.title)
      expect(after.order).toBe(before.order)
      expect(after.isPreview).toBe(true)
      expect(after.video).toMatchObject({ provider: "fake", uploadId: "u-9", assetId: "a-9", playbackId: "p-9", durationSec: 7, status: "ready" })
      const versionsAfter = await payload.countVersions({ collection: "courses", where: { parent: { equals: c.doc.id } }, overrideAccess: true })
      expect(versionsAfter.totalDocs).toBe(versionsBefore.totalDocs)
      const course = await payload.findByID({ collection: "courses", id: c.doc.id, overrideAccess: true })
      expect(course._status).toBe("published")
    })

    it("recordLessonVideo on an unknown lesson throws", async () => {
      await expect(recordLessonVideo(2_000_000_004, { status: "none" })).rejects.toThrow(/not found/)
    })
  })

  describe("getMaterialDownload", () => {
    it("resolves courseIds via course.materials and via lesson.materials, no URL", async () => {
      const m = await material("pdf", "en")
      const viaCourse = await courseWithEn("published", "in_person")
      await payload.update({ collection: "courses", id: viaCourse.doc.id, overrideAccess: true, data: { materials: [m.id], _status: "published" } })
      const online = await courseWithEn("published")
      const lesson = await makeLesson(payload, online.doc.id, 0)
      await payload.update({ collection: "lessons", id: lesson.id, overrideAccess: true, data: { materials: [m.id] } })

      const dl = await getMaterialDownload(m.id)
      expect(dl).not.toBeNull()
      expect([...(dl?.courseIds ?? [])].map(String).sort()).toEqual([String(viaCourse.doc.id), String(online.doc.id)].sort())
      expect(dl?.mimeType).toBe("application/pdf")
      expect(dl?.storageKey).toMatch(/\.pdf$/)
      expect(dl?.filename).toMatch(/^mat-.*\.pdf$/)
      expect(JSON.stringify(dl)).not.toMatch(/https?:/)
      expect(await getMaterialDownload(2_000_000_005)).toBeNull()
    })

    it("a material attached nowhere has empty courseIds", async () => {
      const m = await material()
      expect((await getMaterialDownload(m.id))?.courseIds).toEqual([])
    })
  })

  describe("listSessionsStartingBetween", () => {
    it("scheduled only, [from, to) boundaries, ascending", async () => {
      const c = await courseWithEn("published", "in_person")
      const base = Date.now() + 30 * 24 * HOUR + (Math.floor(Math.random() * 1000) * 60_000)
      const at = (ms: number, status: "scheduled" | "cancelled" | "completed" = "scheduled") =>
        payload.create({
          collection: "sessions",
          overrideAccess: true,
          data: {
            course: c.doc.id,
            startsAt: new Date(ms).toISOString(),
            endsAt: new Date(ms + 3 * HOUR).toISOString(),
            capacity: 4,
            status,
          },
        })
      const from = new Date(base)
      const to = new Date(base + 10 * HOUR)
      const before = await at(base - 1)
      const onFrom = await at(base)
      const inside = await at(base + 5 * HOUR)
      const onTo = await at(base + 10 * HOUR)
      const cancelled = await at(base + 6 * HOUR, "cancelled")
      const done = await at(base + 7 * HOUR, "completed")

      const out = await listSessionsStartingBetween(from, to)
      const ids = out.map((s) => s.id)
      expect(ids).toEqual([onFrom.id, inside.id])
      for (const excluded of [before, onTo, cancelled, done]) expect(ids).not.toContain(excluded.id)
      expect(out[0]).toMatchObject({ courseId: c.doc.id, status: "scheduled", capacity: 4 })
      expect(await listSessionsStartingBetween(to, from)).toEqual([])
    })

    it("excludes sessions of unpublished courses", async () => {
      const d = await courseWithEn("draft", "in_person")
      const s = await makeSession(payload, d.doc.id)
      const start = new Date(s.startsAt)
      const out = await listSessionsStartingBetween(new Date(start.getTime() - 1000), new Date(start.getTime() + 1000))
      expect(out.map((x) => x.id)).not.toContain(s.id)
    })
  })
})
