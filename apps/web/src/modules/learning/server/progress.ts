import type { Payload } from "payload"

import { hasActiveEntitlement, listActiveEntitlements } from "@/modules/access"
import { getCourseLessonsContent, getLessonVideoRef, getPublishedCourse, listCoursesByIds } from "@/modules/catalog"
import type { ID, Locale, Result } from "@/modules/_shared"

import type { CertificateView, CoursePlayerView, CourseProgressSummary, RecordProgressResult } from "../types"
import { issueCertificateIfComplete, toCertificateView } from "./certificates"
import { isCourseComplete, relId } from "./course"
import { getPayload } from "./payload"
import { PROGRESS_UNIQUE_COLS, isUniqueConflict } from "./unique"

type ProgressDoc = {
  id: ID
  lesson: ID | { id: ID }
  completed?: boolean | null
  positionSec?: number | null
}

export function clampPosition(value: number, durationSec: number | null): number {
  const floored = Math.max(0, value)
  return durationSec !== null && durationSec > 0 ? Math.min(floored, durationSec) : floored
}

async function findProgress(payload: Payload, customerId: ID, lessonId: ID): Promise<ProgressDoc | null> {
  const { docs } = await payload.find({
    collection: "lesson-progress",
    where: { and: [{ customer: { equals: customerId } }, { lesson: { equals: lessonId } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return (docs[0] as unknown as ProgressDoc | undefined) ?? null
}

/**
 * Race-safe upsert on UNIQUE (customer, lesson). `completed` only ever moves
 * false → true (never written as false); `completedAt` is written once.
 * Updates go through the adapter so only the supplied columns are written
 * (a full-document Payload update would let a stale read revert `completed`).
 * Returns whether the lesson is completed after the write.
 */
async function upsertProgress(
  payload: Payload,
  i: { customerId: ID; lessonId: ID; courseId: ID; completed: boolean; positionSec?: number },
): Promise<boolean> {
  let existing = await findProgress(payload, i.customerId, i.lessonId)
  if (!existing) {
    try {
      await payload.create({
        collection: "lesson-progress",
        data: {
          customer: i.customerId as number,
          lesson: i.lessonId as number,
          course: i.courseId as number,
          completed: i.completed,
          ...(i.completed ? { completedAt: new Date().toISOString() } : {}),
          positionSec: i.positionSec ?? 0,
        },
        depth: 0,
        overrideAccess: true,
      })
      return i.completed
    } catch (error) {
      if (!isUniqueConflict(error, PROGRESS_UNIQUE_COLS)) throw error
      existing = await findProgress(payload, i.customerId, i.lessonId)
      if (!existing) throw error
    }
  }

  const alreadyDone = existing.completed === true
  const data: Record<string, unknown> = {}
  if (i.positionSec !== undefined) data.positionSec = i.positionSec
  if (i.completed && !alreadyDone) {
    data.completed = true
    data.completedAt = new Date().toISOString()
  }
  if (Object.keys(data).length > 0) {
    await payload.db.updateOne({ collection: "lesson-progress", id: existing.id, data, returning: false })
  }
  return alreadyDone || i.completed
}

export async function recordProgress(i: {
  customerId: ID
  lessonId: ID
  completed?: boolean
  positionSec?: number
}): Promise<Result<RecordProgressResult>> {
  if (i.positionSec !== undefined && !Number.isFinite(i.positionSec)) {
    return { ok: false, error: { code: "VALIDATION", issues: [{ path: "positionSec", message: "not a finite number" }] } }
  }
  const lesson = await getLessonVideoRef(i.lessonId)
  if (!lesson || lesson.courseStatus !== "published") {
    return { ok: false, error: { code: "NOT_FOUND", entity: "lesson" } }
  }
  if (!(await hasActiveEntitlement(i.customerId, lesson.courseId))) {
    return { ok: false, error: { code: "FORBIDDEN" } }
  }

  const payload = await getPayload()
  const lessonDone = await upsertProgress(payload, {
    customerId: i.customerId,
    lessonId: i.lessonId,
    courseId: lesson.courseId,
    completed: i.completed === true,
    positionSec: i.positionSec === undefined ? undefined : clampPosition(i.positionSec, lesson.durationSec),
  })
  if (!lessonDone || !(await isCourseComplete(i.customerId, lesson.courseId))) {
    return { ok: true, data: { courseCompleted: false } }
  }

  const issued = await issueCertificateIfComplete(i.customerId, lesson.courseId)
  if (!issued.ok) return issued
  return {
    ok: true,
    data: { courseCompleted: true, ...(issued.data ? { certificateId: issued.data.id } : {}) },
  }
}

async function findCertificateView(
  payload: Payload,
  customerId: ID,
  courseId: ID,
  locale: Locale,
): Promise<CertificateView | null> {
  const { docs } = await payload.find({
    collection: "certificates",
    where: { and: [{ customer: { equals: customerId } }, { course: { equals: courseId } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const doc = docs[0]
  return doc ? toCertificateView(doc as unknown as Parameters<typeof toCertificateView>[0], locale) : null
}

export async function getCoursePlayer(
  customerId: ID,
  courseSlug: string,
  locale: Locale,
): Promise<Result<CoursePlayerView>> {
  const course = await getPublishedCourse(courseSlug, locale)
  if (!course || course.format !== "online") return { ok: false, error: { code: "NOT_FOUND", entity: "course" } }
  if (!(await hasActiveEntitlement(customerId, course.id))) return { ok: false, error: { code: "FORBIDDEN" } }

  const payload = await getPayload()
  const [lessons, progress, certificate] = await Promise.all([
    getCourseLessonsContent(course.id, locale),
    payload.find({
      collection: "lesson-progress",
      where: { and: [{ customer: { equals: customerId } }, { course: { equals: course.id } }] },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    }),
    findCertificateView(payload, customerId, course.id, locale),
  ])
  const byLesson = new Map((progress.docs as unknown as ProgressDoc[]).map((p) => [String(relId(p.lesson)), p]))
  const withProgress = lessons.map((l) => {
    const p = byLesson.get(String(l.id))
    return { ...l, completed: p?.completed === true, positionSec: p?.positionSec ?? 0 }
  })
  return {
    ok: true,
    data: {
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      certificateEnabled: course.certificateEnabled,
      lessons: withProgress,
      progress: { completed: withProgress.filter((l) => l.completed).length, total: withProgress.length },
      certificate,
    },
  }
}

export async function getCourseProgressSummaries(customerId: ID, locale: Locale): Promise<CourseProgressSummary[]> {
  const entitlements = await listActiveEntitlements(customerId)
  const courseIds = [...new Set(entitlements.map((e) => e.courseId))]
  if (courseIds.length === 0) return []

  const payload = await getPayload()
  const cards = (await listCoursesByIds(courseIds, locale)).filter((c) => c.format === "online")
  if (cards.length === 0) return []
  const ids = cards.map((c) => c.id)

  const [progress, certs, lessonsByCourse] = await Promise.all([
    payload.find({
      collection: "lesson-progress",
      where: { and: [{ customer: { equals: customerId } }, { course: { in: ids }, completed: { equals: true } }] },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: "certificates",
      where: { and: [{ customer: { equals: customerId } }, { course: { in: ids } }] },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    }),
    Promise.all(ids.map((id) => getCourseLessonsContent(id, locale))),
  ])
  const done = new Set((progress.docs as unknown as ProgressDoc[]).map((p) => String(relId(p.lesson))))
  const certByCourse = new Map(
    (certs.docs as unknown as { id: ID; course: ID | { id: ID } }[]).map((c) => [String(relId(c.course)), c.id]),
  )

  return cards.map((card, idx) => {
    const lessons = lessonsByCourse[idx] ?? []
    const completedLessons = lessons.filter((l) => done.has(String(l.id))).length
    const next = lessons.find((l) => !done.has(String(l.id)))
    return {
      courseId: card.id,
      slug: card.slug,
      title: card.title,
      completedLessons,
      totalLessons: lessons.length,
      nextLessonId: next?.id ?? null,
      completed: lessons.length > 0 && completedLessons === lessons.length,
      certificateId: certByCourse.get(String(card.id)) ?? null,
    }
  })
}
