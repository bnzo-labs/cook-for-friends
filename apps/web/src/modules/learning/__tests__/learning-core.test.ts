/**
 * Integration tests (real Postgres, throwaway DB via TEST_DATABASE_URL). Skipped without it; CI runs them.
 * W3-03a: player view, progress, certificate issue / verify / PDF access.
 */
import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeLesson, makeStaff } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { grantEntitlement, revokeEntitlement } from "@/modules/access"
import { recordLessonVideo } from "@/modules/catalog"
import { VERIFICATION_CODE_RE } from "../collections/certificates"
import {
  getCertificateForPdf,
  getCoursePlayer,
  getCourseProgressSummaries,
  issueCertificateIfComplete,
  listCustomerCertificates,
  recordProgress,
  renderCertificatePdf,
  verifyCertificate,
} from "../index"
import { extractPdfText } from "./pdf-text"

describe.skipIf(!hasTestDb)("learning core (integration)", { timeout: 120_000 }, () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  async function customer(over: { firstName?: string | null; lastName?: string | null; locale?: "fr" | "en" } = {}) {
    const k = uid()
    return payload.create({
      collection: "customers",
      overrideAccess: true,
      data: {
        email: `learner-${k}@example.com`,
        preferredLocale: over.locale ?? "fr",
        firstName: over.firstName === undefined ? "Zoé" : over.firstName,
        lastName: over.lastName === undefined ? "Tremblay" : over.lastName,
      },
    })
  }

  async function onlineCourse(o: { certificateEnabled?: boolean; lessons?: number; format?: "online" | "in_person"; status?: "draft" | "published" } = {}) {
    const k = uid()
    const status = o.status ?? "published"
    const doc = await payload.create({
      collection: "courses",
      locale: "fr",
      overrideAccess: true,
      data: {
        title: `Pain ${k}`,
        slug: `pain-${k}`,
        summary: `Résumé ${k}`,
        format: o.format ?? "online",
        price: 5000,
        certificateEnabled: o.certificateEnabled ?? true,
        status,
        _status: status === "draft" ? "draft" : "published",
      },
    })
    await payload.update({
      collection: "courses",
      id: doc.id,
      locale: "en",
      overrideAccess: true,
      data: { title: `Bread ${k}`, slug: `bread-${k}`, summary: `Summary ${k}`, _status: status === "draft" ? "draft" : "published" },
    })
    const lessons = []
    for (let i = 0; i < (o.lessons ?? 2); i++) lessons.push(await makeLesson(payload, doc.id, i))
    return { course: doc, lessons, k, slug: `pain-${k}`, slugEn: `bread-${k}` }
  }

  const entitle = (customerId: number, courseId: number) =>
    grantEntitlement({ customerId, courseId, source: "manual", sourceRef: `t-${uid()}` })

  async function certRows(customerId: number, courseId: number) {
    const r = await payload.find({
      collection: "certificates",
      where: { and: [{ customer: { equals: customerId } }, { course: { equals: courseId } }] },
      depth: 0,
      limit: 10,
      overrideAccess: true,
    })
    return r.docs
  }

  async function certJobs(certificateIds: (string | number)[]) {
    const r = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" } },
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    const keys = new Set(certificateIds.map((id) => `certificate-${id}`))
    return r.docs.filter((d) => keys.has(String((d.input as Record<string, unknown> | null)?.idempotencyKey)))
  }

  async function progressRows(customerId: number, lessonId: number) {
    const r = await payload.find({
      collection: "lesson-progress",
      where: { and: [{ customer: { equals: customerId } }, { lesson: { equals: lessonId } }] },
      depth: 0,
      limit: 10,
      overrideAccess: true,
    })
    return r.docs
  }

  describe("access", () => {
    it("no entitlement → FORBIDDEN for player and progress", async () => {
      const c = await customer()
      const { course, lessons, slug } = await onlineCourse()
      expect(await getCoursePlayer(c.id, slug, "fr")).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
      expect(await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })).toEqual({
        ok: false,
        error: { code: "FORBIDDEN" },
      })
      expect(await progressRows(c.id, lessons[0]!.id)).toHaveLength(0)
      expect(await certRows(c.id, course.id)).toHaveLength(0)
    })

    it("preview lessons do not record progress for non-entitled users", async () => {
      const c = await customer()
      const { lessons } = await onlineCourse()
      await payload.update({ collection: "lessons", id: lessons[0]!.id, overrideAccess: true, data: { isPreview: true } })
      const r = await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, positionSec: 5 })
      expect(r).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
    })

    it("revoked entitlement → FORBIDDEN", async () => {
      const c = await customer()
      const { course, lessons, slug } = await onlineCourse()
      const g = await grantEntitlement({ customerId: c.id, courseId: course.id, source: "manual", sourceRef: "rv-" + uid() })
      expect(g.ok).toBe(true)
      expect((await getCoursePlayer(c.id, slug, "fr")).ok).toBe(true)
      if (g.ok) {
        await revokeEntitlement({ customerId: c.id, courseId: course.id, source: "manual", sourceRef: g.data.sourceRef, reason: "test" })
      }
      expect(await getCoursePlayer(c.id, slug, "fr")).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
      expect((await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })).ok).toBe(false)
    })

    it("unknown / draft / in-person course → NOT_FOUND; unknown lesson → NOT_FOUND", async () => {
      const c = await customer()
      const draft = await onlineCourse({ status: "draft" })
      const inPerson = await onlineCourse({ format: "in_person", lessons: 0 })
      for (const slug of ["nope-" + uid(), draft.slug, inPerson.slug]) {
        const r = await getCoursePlayer(c.id, slug, "fr")
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error.code).toBe("NOT_FOUND")
      }
      const l = await recordProgress({ customerId: c.id, lessonId: 2_000_000_000, completed: true })
      expect(l.ok).toBe(false)
      if (!l.ok) expect(l.error.code).toBe("NOT_FOUND")
    })

    it("progress on a draft course is NOT_FOUND even when entitled", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ status: "draft" })
      await entitle(c.id, course.id)
      const r = await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe("NOT_FOUND")
    })
  })

  describe("player view + progress", () => {
    it("lists ordered lessons without raw video ids, with per-lesson state and progress", async () => {
      const c = await customer()
      const { course, lessons, slug, slugEn, k } = await onlineCourse({ lessons: 3 })
      await entitle(c.id, course.id)
      await recordLessonVideo(lessons[1]!.id, { status: "ready", provider: "fake", assetId: "secret-asset", playbackId: "secret-play", durationSec: 120 })
      await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true, positionSec: 10 })
      await recordProgress({ customerId: c.id, lessonId: lessons[1]!.id, positionSec: 45 })

      const res = await getCoursePlayer(c.id, slug, "fr")
      expect(res.ok).toBe(true)
      if (!res.ok) return
      const v = res.data
      expect(v.courseId).toBe(course.id)
      expect(v.title).toBe(`Pain ${k}`)
      expect(v.certificateEnabled).toBe(true)
      expect(v.lessons.map((l) => l.id)).toEqual(lessons.map((l) => l.id))
      expect(v.lessons.map((l) => l.completed)).toEqual([true, false, false])
      expect(v.lessons.map((l) => l.positionSec)).toEqual([10, 45, 0])
      expect(v.progress).toEqual({ completed: 1, total: 3 })
      expect(v.certificate).toBeNull()
      expect(v.lessons[1]!.video).toEqual({ status: "ready", durationSec: 120 })
      expect(JSON.stringify(v)).not.toMatch(/secret-asset|secret-play/)

      const en = await getCoursePlayer(c.id, slugEn, "en")
      expect(en.ok && en.data.title).toBe(`Bread ${k}`)
    })

    it("positionSec clamps to 0..durationSec, last write wins (seek back allowed)", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ lessons: 1 })
      await entitle(c.id, course.id)
      await recordLessonVideo(lessons[0]!.id, { status: "ready", provider: "fake", durationSec: 100 })
      const lesson = lessons[0]!.id
      await recordProgress({ customerId: c.id, lessonId: lesson, positionSec: 500 })
      expect((await progressRows(c.id, lesson))[0]!.positionSec).toBe(100)
      await recordProgress({ customerId: c.id, lessonId: lesson, positionSec: 30 })
      expect((await progressRows(c.id, lesson))[0]!.positionSec).toBe(30)
      const bad = await recordProgress({ customerId: c.id, lessonId: lesson, positionSec: Number.NaN })
      expect(bad.ok).toBe(false)
      if (!bad.ok) expect(bad.error.code).toBe("VALIDATION")
    })

    it("completed is sticky and completedAt is set once", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ lessons: 2 })
      await entitle(c.id, course.id)
      const lesson = lessons[0]!.id
      await recordProgress({ customerId: c.id, lessonId: lesson, completed: true })
      const first = (await progressRows(c.id, lesson))[0]!
      expect(first.completed).toBe(true)
      expect(first.completedAt).toBeTruthy()
      await new Promise((r) => setTimeout(r, 20))
      await recordProgress({ customerId: c.id, lessonId: lesson, completed: false, positionSec: 12 })
      await recordProgress({ customerId: c.id, lessonId: lesson, positionSec: 13 })
      await recordProgress({ customerId: c.id, lessonId: lesson, completed: true })
      const after = (await progressRows(c.id, lesson))[0]!
      expect(after.completed).toBe(true)
      expect(after.completedAt).toBe(first.completedAt)
      expect(after.positionSec).toBe(13)
    })

    it("concurrent first writes (x5) on the same lesson → one row", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ lessons: 2 })
      await entitle(c.id, course.id)
      const lesson = lessons[0]!.id
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((n) => recordProgress({ customerId: c.id, lessonId: lesson, positionSec: n, completed: n === 3 })),
      )
      expect(results.every((r) => r.ok)).toBe(true)
      const rows = await progressRows(c.id, lesson)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.completed).toBe(true) // sticky even when a later writer sent no/false completion
    })
  })

  describe("certificates", () => {
    it("completing the last lesson → courseCompleted, exactly one certificate and one certificate-issued job", async () => {
      const c = await customer({ firstName: "Zoé", lastName: "Tremblay" })
      const { course, lessons, k } = await onlineCourse({ lessons: 2 })
      await entitle(c.id, course.id)

      const a = await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      expect(a).toEqual({ ok: true, data: { courseCompleted: false } })
      expect(await certRows(c.id, course.id)).toHaveLength(0)

      const b = await recordProgress({ customerId: c.id, lessonId: lessons[1]!.id, completed: true })
      expect(b.ok && b.data.courseCompleted).toBe(true)
      const certs = await certRows(c.id, course.id)
      expect(certs).toHaveLength(1)
      const cert = certs[0]!
      expect(b.ok && b.data.certificateId).toBe(cert.id)
      expect(cert.verificationCode).toMatch(VERIFICATION_CODE_RE)
      expect(cert.customerNameSnapshot).toBe("Zoé Tremblay")
      expect(cert.locale).toBe("fr")
      expect(cert.courseTitleSnapshot).toMatchObject({ fr: `Pain ${k}`, en: `Bread ${k}` })

      const jobs = await certJobs([cert.id])
      expect(jobs).toHaveLength(1)
      const input = jobs[0]!.input as { template: string; to: string; locale: string; data: Record<string, string> }
      expect(input.template).toBe("certificate-issued")
      expect(input.to).toBe(c.email)
      expect(input.locale).toBe("fr")
      expect(input.data.verificationCode).toBe(cert.verificationCode)
      expect(input.data.courseTitle).toBe(`Pain ${k}`)
      expect(input.data.verifyUrl).toMatch(new RegExp(`^https?://[^/]+/fr/certificats/verifier/${cert.verificationCode}$`))
      expect(input.data.downloadUrl).toMatch(/^https?:\/\/[^/]+\/fr\/compte\/historique#certificates$/)

      // Re-completing is idempotent: same certificate id, no second row, no second job.
      const again = await recordProgress({ customerId: c.id, lessonId: lessons[1]!.id, completed: true })
      expect(again.ok && again.data).toEqual({ courseCompleted: true, certificateId: cert.id })
      expect(await certRows(c.id, course.id)).toHaveLength(1)
      expect(await certJobs([cert.id])).toHaveLength(1)
    })

    it("concurrent completion of the last two lessons → still one certificate and one job", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ lessons: 3 })
      await entitle(c.id, course.id)
      await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      const results = await Promise.all([
        recordProgress({ customerId: c.id, lessonId: lessons[1]!.id, completed: true }),
        recordProgress({ customerId: c.id, lessonId: lessons[2]!.id, completed: true }),
      ])
      expect(results.every((r) => r.ok)).toBe(true)
      const certs = await certRows(c.id, course.id)
      expect(certs).toHaveLength(1)
      expect(await certJobs([certs[0]!.id])).toHaveLength(1)
      // Whoever saw completion got the same certificate.
      for (const r of results) if (r.ok && r.data.certificateId !== undefined) expect(r.data.certificateId).toBe(certs[0]!.id)
    })

    it("concurrent issueCertificateIfComplete (x5) → one row, same view for all", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ lessons: 1 })
      await entitle(c.id, course.id)
      await payload.create({
        collection: "lesson-progress",
        overrideAccess: true,
        data: { customer: c.id, lesson: lessons[0]!.id, course: course.id, completed: true, completedAt: new Date().toISOString() },
      })
      const res = await Promise.all(Array.from({ length: 5 }, () => issueCertificateIfComplete(c.id, course.id)))
      const ids = new Set(res.map((r) => (r.ok && r.data ? String(r.data.id) : "none")))
      expect(ids.size).toBe(1)
      expect(ids.has("none")).toBe(false)
      const certs = await certRows(c.id, course.id)
      expect(certs).toHaveLength(1)
      expect(await certJobs([certs[0]!.id])).toHaveLength(1)
    })

    it("certificateEnabled=false → course completes, no certificate, no job", async () => {
      const c = await customer()
      const { course, lessons } = await onlineCourse({ lessons: 1, certificateEnabled: false })
      await entitle(c.id, course.id)
      const r = await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      expect(r).toEqual({ ok: true, data: { courseCompleted: true } })
      expect(await certRows(c.id, course.id)).toHaveLength(0)
      expect(await issueCertificateIfComplete(c.id, course.id)).toEqual({ ok: true, data: null })
    })

    it("incomplete course, 0-lesson course and in-person course never certify", async () => {
      const c = await customer()
      const partial = await onlineCourse({ lessons: 2 })
      await entitle(c.id, partial.course.id)
      await recordProgress({ customerId: c.id, lessonId: partial.lessons[0]!.id, completed: true })
      expect(await issueCertificateIfComplete(c.id, partial.course.id)).toEqual({ ok: true, data: null })

      const empty = await onlineCourse({ lessons: 0 })
      await entitle(c.id, empty.course.id)
      expect(await issueCertificateIfComplete(c.id, empty.course.id)).toEqual({ ok: true, data: null })

      const inPerson = await onlineCourse({ format: "in_person", lessons: 0 })
      await entitle(c.id, inPerson.course.id)
      const r = await issueCertificateIfComplete(c.id, inPerson.course.id)
      expect(r.ok).toBe(false)
    })

    it("issue requires an active entitlement", async () => {
      const c = await customer()
      const { course } = await onlineCourse({ lessons: 1 })
      expect(await issueCertificateIfComplete(c.id, course.id)).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
    })

    it("EN customer: certificate + email in en, name falls back to email local part", async () => {
      const c = await customer({ firstName: null, lastName: null, locale: "en" })
      const { course, lessons, k } = await onlineCourse({ lessons: 1 })
      await entitle(c.id, course.id)
      const r = await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      expect(r.ok && r.data.courseCompleted).toBe(true)
      const cert = (await certRows(c.id, course.id))[0]!
      expect(cert.locale).toBe("en")
      expect(cert.customerNameSnapshot).toBe(c.email.split("@")[0])
      const input = (await certJobs([cert.id]))[0]!.input as { locale: string; data: Record<string, string> }
      expect(input.locale).toBe("en")
      expect(input.data.courseTitle).toBe(`Bread ${k}`)
      expect(input.data.verifyUrl).toContain(`/en/certificates/verify/${cert.verificationCode}`)
      expect(input.data.downloadUrl).toContain("/en/account/history#certificates")
    })

    it("verifyCertificate: normalizes input, unknown → null, public view has no email or ids", async () => {
      const c = await customer({ firstName: "Ana", lastName: "Roy" })
      const { course, lessons, k } = await onlineCourse({ lessons: 1 })
      await entitle(c.id, course.id)
      await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      const cert = (await certRows(c.id, course.id))[0]!
      const code = cert.verificationCode
      const hyphenated = `${code.slice(0, 5)}-${code.slice(5)}`.toLowerCase()

      for (const input of [code, code.toLowerCase(), hyphenated, ` ${code.slice(0, 3)} ${code.slice(3)} `]) {
        const v = await verifyCertificate(input)
        expect(v).not.toBeNull()
        expect(v!.code).toBe(code)
      }
      const v = (await verifyCertificate(code))!
      expect(Object.keys(v).sort()).toEqual(["code", "courseTitle", "customerName", "issuedAt"])
      expect(v.customerName).toBe("Ana Roy")
      expect(v.courseTitle).toEqual({ fr: `Pain ${k}`, en: `Bread ${k}` })
      const json = JSON.stringify(v)
      expect(json).not.toContain(c.email)
      expect(json).not.toContain("@")

      expect(await verifyCertificate("0000000000")).toBeNull()
      expect(await verifyCertificate("short")).toBeNull()
      expect(await verifyCertificate("")).toBeNull()
    })

    it("listCustomerCertificates + getCourseProgressSummaries", async () => {
      const c = await customer()
      const done = await onlineCourse({ lessons: 1 })
      const part = await onlineCourse({ lessons: 3 })
      const other = await onlineCourse({ lessons: 1 })
      await entitle(c.id, done.course.id)
      await entitle(c.id, part.course.id)
      await recordProgress({ customerId: c.id, lessonId: done.lessons[0]!.id, completed: true })
      await recordProgress({ customerId: c.id, lessonId: part.lessons[0]!.id, completed: true })

      const certs = await listCustomerCertificates(c.id, "en")
      expect(certs).toHaveLength(1)
      expect(certs[0]).toMatchObject({ courseId: done.course.id, courseTitle: `Bread ${done.k}` })

      const sums = await getCourseProgressSummaries(c.id, "fr")
      const byId = new Map(sums.map((s) => [String(s.courseId), s]))
      expect(byId.has(String(other.course.id))).toBe(false)
      expect(byId.get(String(done.course.id))).toMatchObject({ completedLessons: 1, totalLessons: 1, nextLessonId: null, completed: true, certificateId: certs[0]!.id })
      expect(byId.get(String(part.course.id))).toMatchObject({
        completedLessons: 1,
        totalLessons: 3,
        nextLessonId: part.lessons[1]!.id,
        completed: false,
        certificateId: null,
      })
      expect(await getCourseProgressSummaries((await customer()).id, "fr")).toEqual([])
    })

    it("player exposes the issued certificate", async () => {
      const c = await customer()
      const { course, lessons, slug } = await onlineCourse({ lessons: 1 })
      await entitle(c.id, course.id)
      await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      const res = await getCoursePlayer(c.id, slug, "fr")
      expect(res.ok && res.data.certificate?.verificationCode).toMatch(VERIFICATION_CODE_RE)
      expect(res.ok && res.data.progress).toEqual({ completed: 1, total: 1 })
    })

    it("PDF access: owner and staff yes; other customer, anonymous, unknown no", async () => {
      const owner = await customer()
      const other = await customer()
      const staff = await makeStaff(payload, "staff")
      expect(staff.id).toBeTruthy()
      const { course, lessons } = await onlineCourse({ lessons: 1 })
      await entitle(owner.id, course.id)
      await recordProgress({ customerId: owner.id, lessonId: lessons[0]!.id, completed: true })
      const cert = (await certRows(owner.id, course.id))[0]!

      expect(await getCertificateForPdf(cert.id, { kind: "customer", id: owner.id })).toMatchObject({ id: cert.id, verificationCode: cert.verificationCode, locale: "fr" })
      expect(await getCertificateForPdf(cert.id, { kind: "staff" })).not.toBeNull()
      expect(await getCertificateForPdf(cert.id, { kind: "customer", id: other.id })).toBeNull()
      expect(await getCertificateForPdf(cert.id, null)).toBeNull()
      expect(await getCertificateForPdf(2_000_000_000, { kind: "staff" })).toBeNull()
    })

    it("renderCertificatePdf from the DB row: FR + EN, name and code present", async () => {
      const c = await customer({ firstName: "Zoé", lastName: "Tremblay" })
      const { course, lessons } = await onlineCourse({ lessons: 1 })
      await entitle(c.id, course.id)
      await recordProgress({ customerId: c.id, lessonId: lessons[0]!.id, completed: true })
      const cert = (await certRows(c.id, course.id))[0]!
      for (const locale of ["fr", "en"] as const) {
        const buf = await renderCertificatePdf(cert.id, locale)
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
        expect(buf.length).toBeLessThan(200 * 1024)
        const text = extractPdfText(buf)
        expect(text).toContain("Zoé Tremblay")
        expect(text).toContain(cert.verificationCode)
      }
      await expect(renderCertificatePdf(2_000_000_000, "fr")).rejects.toThrow(/not found/)
    })
  })
})
