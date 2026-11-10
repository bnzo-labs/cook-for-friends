import { getCourseLessonsContent, getPublishedCourse, listCoursesByIds } from "@/modules/catalog"
import type { ID, Locale } from "@/modules/_shared"

import { getPayload } from "./payload"

export type LearningCourse = {
  id: ID
  slug: string
  title: string
  certificateEnabled: boolean
}

/** Published ONLINE course by id, localized. Null for unknown / draft / in-person. */
export async function loadOnlineCourse(courseId: ID, locale: Locale): Promise<LearningCourse | null> {
  const [card] = await listCoursesByIds([courseId], locale)
  if (!card || card.format !== "online") return null
  const view = await getPublishedCourse(card.slug, locale)
  if (!view || view.id !== card.id) return null
  return { id: card.id, slug: card.slug, title: card.title, certificateEnabled: view.certificateEnabled }
}

export const relId = (v: unknown): ID => (v && typeof v === "object" ? (v as { id: ID }).id : (v as ID))

/** Ids of the lessons of a published course. */
export async function publishedLessonIds(courseId: ID): Promise<ID[]> {
  const lessons = await getCourseLessonsContent(courseId, "fr")
  return lessons.map((l) => l.id)
}

/** Lesson ids the customer has completed in this course. */
export async function completedLessonIds(customerId: ID, courseId: ID): Promise<Set<string>> {
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "lesson-progress",
    where: {
      and: [
        { customer: { equals: customerId } },
        { course: { equals: courseId } },
        { completed: { equals: true } },
      ],
    },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return new Set(docs.map((d) => String(relId(d.lesson))))
}

/** Complete ⇔ the course has ≥1 lesson and every one is completed. */
export async function isCourseComplete(customerId: ID, courseId: ID): Promise<boolean> {
  const [lessonIds, done] = await Promise.all([publishedLessonIds(courseId), completedLessonIds(customerId, courseId)])
  return lessonIds.length > 0 && lessonIds.every((id) => done.has(String(id)))
}
