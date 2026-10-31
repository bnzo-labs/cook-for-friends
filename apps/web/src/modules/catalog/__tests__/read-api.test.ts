import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import {
  getCancellationPolicy,
  getCourseCommerceRecord,
  getPublishedCourse,
  getSessionView,
  getSiteSettings,
  listPublishedCourses,
  recordCourseStripeSync,
} from "../index"

const DAY = 86_400_000

describe.skipIf(!hasTestDb)("catalog read API (integration)", { timeout: 30_000 }, () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  type CourseOpts = {
    format?: "in_person" | "online"
    status?: "draft" | "published" | "unlisted"
    enSlug?: boolean
    enTitle?: boolean
    enSummary?: boolean
  }

  async function course(opts: CourseOpts = {}) {
    const { format = "in_person", status = "published", enSlug = true, enTitle = true, enSummary = true } = opts
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
        level: "beginner",
        // "unlisted": published version whose `status` field is "archived".
        status: status === "unlisted" ? "archived" : status,
        _status: status === "draft" ? "draft" : "published",
      },
    })
    const en: Record<string, string> = {}
    if (enTitle) en.title = `Course ${k}`
    if (enSlug) en.slug = `course-${k}`
    if (enSummary) en.summary = `Summary ${k}`
    if (Object.keys(en).length > 0) {
      await payload.update({
        collection: "courses",
        id: doc.id,
        locale: "en",
        overrideAccess: true,
        draft: status === "draft",
        data: en,
      })
    }
    return { id: doc.id, k }
  }

  async function session(courseId: number, over: { days?: number; status?: "scheduled" | "cancelled"; name?: string } = {}) {
    const start = new Date(Date.now() + (over.days ?? 7) * DAY)
    return payload.create({
      collection: "sessions",
      locale: "fr",
      overrideAccess: true,
      data: {
        course: courseId,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
        capacity: 6,
        status: over.status ?? "scheduled",
        location: { name: over.name ?? "Atelier", city: "Montréal" },
      },
    })
  }

  describe("getPublishedCourse", () => {
    it("resolves by localized slug per locale", async () => {
      const { id, k } = await course()
      expect((await getPublishedCourse(`cours-${k}`, "fr"))?.id).toBe(id)
      expect((await getPublishedCourse(`course-${k}`, "en"))?.id).toBe(id)
      const en = await getPublishedCourse(`course-${k}`, "en")
      expect(en).toMatchObject({ title: `Course ${k}`, slug: `course-${k}`, isLocaleFallback: false })
    })

    it("rule: slug of another locale does not resolve when the course has its own EN slug", async () => {
      const { k } = await course()
      expect(await getPublishedCourse(`cours-${k}`, "en")).toBeNull()
      expect(await getPublishedCourse(`course-${k}`, "fr")).toBeNull()
    })

    it("rule: FR slug resolves under EN only when EN slug is missing; shows French + badge", async () => {
      const { id, k } = await course({ enSlug: false, enTitle: false, enSummary: false })
      const view = await getPublishedCourse(`cours-${k}`, "en")
      expect(view).toMatchObject({
        id,
        title: `Cours ${k}`,
        slug: `cours-${k}`,
        isLocaleFallback: true,
      })
    })

    it("flags fallback when only the EN summary is missing", async () => {
      const { k } = await course({ enSummary: false })
      const view = await getPublishedCourse(`course-${k}`, "en")
      expect(view?.title).toBe(`Course ${k}`)
      expect(view?.summary).toBe(`Résumé ${k}`)
      expect(view?.isLocaleFallback).toBe(true)
    })

    it("returns null for unknown, draft-only and unlisted (status != published) courses", async () => {
      const draft = await course({ status: "draft" })
      const unlisted = await course({ status: "unlisted" })
      expect(await getPublishedCourse("nope-nope", "fr")).toBeNull()
      expect(await getPublishedCourse(`cours-${draft.k}`, "fr")).toBeNull()
      expect(await getPublishedCourse(`cours-${unlisted.k}`, "fr")).toBeNull()
    })

    it("a saved draft title change is never visible", async () => {
      const { id, k } = await course()
      await payload.update({
        collection: "courses",
        id,
        locale: "fr",
        draft: true,
        overrideAccess: true,
        data: { title: "TITRE BROUILLON" },
      })
      expect((await getPublishedCourse(`cours-${k}`, "fr"))?.title).toBe(`Cours ${k}`)
      const record = await getCourseCommerceRecord(id)
      expect(record?.title.fr).toBe(`Cours ${k}`)
      const cards = await listPublishedCourses("fr")
      expect(cards.find((c) => c.id === id)?.title).toBe(`Cours ${k}`)
    })

    it("in-person: upcoming scheduled sessions only, ascending, localized location", async () => {
      const { id, k } = await course()
      const later = await session(id, { days: 20 })
      const sooner = await session(id, { days: 5, name: "Studio A" })
      await payload.update({
        collection: "sessions",
        id: sooner.id,
        locale: "en",
        overrideAccess: true,
        data: { location: { name: "Studio A (EN)" } },
      })
      await session(id, { days: 9, status: "cancelled" })
      await session(id, { days: -3 })
      const view = await getPublishedCourse(`course-${k}`, "en")
      expect(view?.upcomingSessions.map((s) => s.id)).toEqual([sooner.id, later.id])
      expect(view?.upcomingSessions[0]).toMatchObject({
        status: "scheduled",
        capacity: 6,
        level: "beginner",
        location: { name: "Studio A (EN)", city: "Montréal" },
      })
      expect(view?.lessons).toEqual([])
    })

    it("online: lesson titles only, in course order; no body/video keys", async () => {
      const { id, k } = await course({ format: "online" })
      const mk = (order: number, title: string, isPreview = false) =>
        payload.create({
          collection: "lessons",
          locale: "fr",
          overrideAccess: true,
          data: {
            course: id,
            order,
            title,
            isPreview,
            video: { provider: "mux", assetId: "secret-asset", playbackId: "secret-playback" },
          },
        })
      const a = await mk(0, "Un", true)
      const b = await mk(1, "Deux")
      await payload.update({
        collection: "courses",
        id,
        overrideAccess: true,
        data: { lessons: [b.id, a.id], _status: "published" },
      })
      const view = await getPublishedCourse(`course-${k}`, "en")
      expect(view?.lessons.map((l) => l.title)).toEqual(["Deux", "Un"])
      expect(view?.lessons[1]).toEqual({ id: a.id, title: "Un", order: 0, isPreview: true })
      expect(JSON.stringify(view)).not.toContain("secret-")
      expect(view?.upcomingSessions).toEqual([])
    })
  })

  describe("listPublishedCourses", () => {
    it("lists published only, filters by format, sets nextSessionAt", async () => {
      const inp = await course()
      const onl = await course({ format: "online" })
      const draft = await course({ status: "draft" })
      const unlisted = await course({ status: "unlisted" })
      const s = await session(inp.id, { days: 4 })
      await session(inp.id, { days: 2, status: "cancelled" })

      const all = await listPublishedCourses("fr")
      const ids = all.map((c) => c.id)
      expect(ids).toEqual(expect.arrayContaining([inp.id, onl.id]))
      expect(ids).not.toContain(draft.id)
      expect(ids).not.toContain(unlisted.id)

      const card = all.find((c) => c.id === inp.id)
      expect(card).toMatchObject({ slug: `cours-${inp.k}`, price: { amount: 5000, currency: "cad" } })
      expect(card?.nextSessionAt).toBe(new Date(s.startsAt).toISOString())
      expect(all.find((c) => c.id === onl.id)?.nextSessionAt).toBeNull()

      const online = await listPublishedCourses("en", { format: "online" })
      expect(online.every((c) => c.format === "online")).toBe(true)
      expect(online.map((c) => c.id)).toContain(onl.id)
      expect(online.map((c) => c.id)).not.toContain(inp.id)
      expect(online.find((c) => c.id === onl.id)?.slug).toBe(`course-${onl.k}`)
    })

    it("marks EN fallback cards", async () => {
      const c = await course({ enTitle: false, enSlug: false, enSummary: false })
      const card = (await listPublishedCourses("en")).find((x) => x.id === c.id)
      expect(card).toMatchObject({ isLocaleFallback: true, title: `Cours ${c.k}`, slug: `cours-${c.k}` })
    })
  })

  describe("getSessionView", () => {
    it("returns the session with course info and no availability", async () => {
      const c = await course()
      const s = await session(c.id, { name: "Atelier FR" })
      const view = await getSessionView(s.id, "en")
      expect(view).toMatchObject({
        id: s.id,
        courseId: c.id,
        courseSlug: `course-${c.k}`,
        courseTitle: `Course ${c.k}`,
        capacity: 6,
        status: "scheduled",
        location: { name: "Atelier FR", city: "Montréal" },
      })
      expect(view).not.toHaveProperty("available")
    })

    it("keeps cancelled sessions visible with their status", async () => {
      const c = await course()
      const s = await session(c.id, { status: "cancelled" })
      expect((await getSessionView(s.id, "fr"))?.status).toBe("cancelled")
    })

    it("null for unknown id and for unpublished course", async () => {
      expect(await getSessionView(999_999_999, "fr")).toBeNull()
      const c = await course()
      const s = await session(c.id)
      await payload.update({
        collection: "courses",
        id: c.id,
        overrideAccess: true,
        data: { status: "draft", _status: "published" },
      })
      expect(await getSessionView(s.id, "fr")).toBeNull()
    })
  })

  describe("getCourseCommerceRecord", () => {
    it("returns both locales and stripe fields for a published course", async () => {
      const c = await course()
      const r = await getCourseCommerceRecord(c.id)
      expect(r).toMatchObject({
        id: c.id,
        format: "in_person",
        status: "published",
        price: 5000,
        title: { fr: `Cours ${c.k}`, en: `Course ${c.k}` },
        slug: { fr: `cours-${c.k}`, en: `course-${c.k}` },
        summary: { fr: `Résumé ${c.k}`, en: `Summary ${c.k}` },
        stripeProductId: null,
        stripePriceId: null,
        stripeSyncStatus: "pending",
      })
    })

    it("null for draft-only and unknown courses", async () => {
      const d = await course({ status: "draft" })
      expect(await getCourseCommerceRecord(d.id)).toBeNull()
      expect(await getCourseCommerceRecord(999_999_999)).toBeNull()
    })
  })

  describe("recordCourseStripeSync", () => {
    it("updates the four sync fields without publishing a pending draft or adding a version", async () => {
      const c = await course()
      await payload.update({
        collection: "courses",
        id: c.id,
        locale: "fr",
        draft: true,
        overrideAccess: true,
        data: { title: "BROUILLON EN ATTENTE" },
      })
      const versionsBefore = await payload.countVersions({ collection: "courses", where: { parent: { equals: c.id } } })

      await recordCourseStripeSync(c.id, { status: "synced", productId: "prod_T1", priceId: "price_T1" })

      const published = await getCourseCommerceRecord(c.id)
      expect(published).toMatchObject({
        stripeProductId: "prod_T1",
        stripePriceId: "price_T1",
        stripeSyncStatus: "synced",
        title: { fr: `Cours ${c.k}` },
      })
      const versionsAfter = await payload.countVersions({ collection: "courses", where: { parent: { equals: c.id } } })
      expect(versionsAfter.totalDocs).toBe(versionsBefore.totalDocs)

      // pending draft still a draft, title intact, and carries the new Stripe ids
      const draft = await payload.findByID({
        collection: "courses",
        id: c.id,
        draft: true,
        locale: "fr",
        overrideAccess: true,
      })
      expect(draft._status).toBe("draft")
      expect(draft.title).toBe("BROUILLON EN ATTENTE")
      expect(draft.stripePriceId).toBe("price_T1")
      const live = await payload.findByID({ collection: "courses", id: c.id, locale: "fr", overrideAccess: true })
      expect(live.title).toBe(`Cours ${c.k}`)
      expect(live._status).toBe("published")
    })

    it("records an error then clears it on success; untouched fields stay", async () => {
      const c = await course()
      await recordCourseStripeSync(c.id, { status: "synced", productId: "prod_T2", priceId: "price_T2" })
      await recordCourseStripeSync(c.id, { status: "error", error: "stripe down" })
      let doc = await payload.findByID({ collection: "courses", id: c.id, overrideAccess: true })
      expect(doc).toMatchObject({ stripeSyncStatus: "error", stripeSyncError: "stripe down", stripePriceId: "price_T2" })
      await recordCourseStripeSync(c.id, { status: "synced", priceId: "price_T3" })
      doc = await payload.findByID({ collection: "courses", id: c.id, overrideAccess: true })
      expect(doc).toMatchObject({
        stripeSyncStatus: "synced",
        stripeSyncError: null,
        stripeProductId: "prod_T2",
        stripePriceId: "price_T3",
        price: 5000,
      })
    })
  })

  describe("settings", () => {
    it("getSiteSettings returns CONTRACT defaults when nothing was customised", async () => {
      const s = await getSiteSettings()
      expect(s.maxSeatsPerPurchase).toBe(4)
      expect(s.holdMinutes).toBe(15)
      expect(s.waitlistNotifyCount).toBe(3)
      expect(s.reminderOffsetsHours).toEqual([48, 24])
    })

    it("getSiteSettings reflects stored values", async () => {
      const before = await getSiteSettings()
      try {
        await payload.updateGlobal({
          slug: "site-settings",
          overrideAccess: true,
          data: { maxSeatsPerPurchase: 4, holdMinutes: 20, contactEmail: "hello@example.com" },
        })
        expect(await getSiteSettings()).toMatchObject({
          maxSeatsPerPurchase: 4,
          holdMinutes: 20,
          contactEmail: "hello@example.com",
        })
      } finally {
        await payload.updateGlobal({
          slug: "site-settings",
          overrideAccess: true,
          data: { maxSeatsPerPurchase: before.maxSeatsPerPurchase, holdMinutes: before.holdMinutes, contactEmail: before.contactEmail },
        })
      }
    })

    it("getCancellationPolicy returns sorted tiers", async () => {
      const prev = await payload.findGlobal({ slug: "cancellation-policy", overrideAccess: true })
      try {
        await payload.updateGlobal({
          slug: "cancellation-policy",
          overrideAccess: true,
          data: {
            customerCanSelfCancel: false,
            tiers: [
              { minHoursBefore: 72, outcome: "refund", percent: 100 },
              { minHoursBefore: 24, outcome: "credit", percent: 50 },
            ],
          },
        })
        expect(await getCancellationPolicy()).toEqual({
          customerCanSelfCancel: false,
          tiers: [
            { minHoursBefore: 72, outcome: "refund", percent: 100 },
            { minHoursBefore: 24, outcome: "credit", percent: 50 },
          ],
        })
      } finally {
        await payload.updateGlobal({
          slug: "cancellation-policy",
          overrideAccess: true,
          data: {
            customerCanSelfCancel: prev.customerCanSelfCancel ?? true,
            tiers: (prev.tiers ?? []).map(({ minHoursBefore, outcome, percent }) => ({ minHoursBefore, outcome, percent })),
          },
        })
      }
    })
  })
})
