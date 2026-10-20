import type { ID, Locale } from "@/modules/_shared"
import type { SessionSummary, SessionView } from "../types"
import {
  FALLBACK_LOCALE,
  level,
  mapSessionSummary,
  pickLocalized,
  type Rec,
} from "./mappers"
import { getPayload } from "./payload"
import { PUBLISHED } from "./where"

/**
 * Scheduled, future sessions grouped by course id (string key), ascending.
 * `locale` localizes the location name.
 */
export async function upcomingSessionsByCourse(
  courseIds: ID[],
  locale: Locale,
): Promise<Map<string, SessionSummary[]>> {
  const out = new Map<string, SessionSummary[]>()
  if (courseIds.length === 0) return out
  const payload = await getPayload()
  const res = await payload.find({
    collection: "sessions",
    where: {
      and: [
        { course: { in: courseIds } },
        { status: { equals: "scheduled" } },
        { startsAt: { greater_than: new Date().toISOString() } },
      ],
    },
    locale,
    fallbackLocale: FALLBACK_LOCALE,
    depth: 0,
    limit: 0,
    pagination: false,
    sort: "startsAt",
    overrideAccess: true,
  })
  const courses = await payload.find({
    collection: "courses",
    where: { id: { in: courseIds } },
    depth: 0,
    limit: 0,
    pagination: false,
    select: { level: true },
    overrideAccess: true,
  })
  const levels = new Map(courses.docs.map((c) => [String(c.id), level(c.level)]))
  for (const s of res.docs as unknown as Rec[]) {
    const key = String(typeof s.course === "object" ? (s.course as Rec).id : s.course)
    const list = out.get(key) ?? []
    list.push(mapSessionSummary(s, levels.get(key) ?? null))
    out.set(key, list)
  }
  return out
}

/**
 * Session of a published course, any status, no availability (commerce owns
 * seat accounting). `null` when unknown or the course is not published.
 */
export async function getSessionView(sessionId: ID, locale: Locale): Promise<SessionView | null> {
  const payload = await getPayload()
  const found = await payload.find({
    collection: "sessions",
    where: { id: { equals: sessionId } },
    locale,
    fallbackLocale: FALLBACK_LOCALE,
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const session = found.docs[0] as unknown as Rec | undefined
  if (!session) return null

  const courseId = typeof session.course === "object" ? (session.course as Rec).id : session.course
  const courses = await payload.find({
    collection: "courses",
    where: { and: [PUBLISHED, { id: { equals: courseId as ID } }] },
    locale: "all",
    depth: 0,
    limit: 1,
    pagination: false,
    select: { slug: true, title: true, level: true },
    overrideAccess: true,
  })
  const course = courses.docs[0] as unknown as Rec | undefined
  if (!course) return null

  return {
    ...mapSessionSummary(session, level(course.level)),
    courseId: course.id as ID,
    courseSlug: pickLocalized(course.slug, locale).value ?? "",
    courseTitle: pickLocalized(course.title, locale).value ?? "",
  }
}
