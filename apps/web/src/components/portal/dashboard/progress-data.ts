import { getCourseProgressSummaries } from "@/modules/learning"
import type { ID, Locale } from "@/modules/_shared"

import type { CourseProgressData } from "./CourseProgress"

/** Progress per course id, from `learning.getCourseProgressSummaries`. */
export async function loadProgressByCourse(customerId: ID, locale: Locale): Promise<Map<string, CourseProgressData>> {
  const summaries = await getCourseProgressSummaries(customerId, locale)
  return new Map(
    summaries.map((s) => [
      String(s.courseId),
      {
        slug: s.slug,
        completedLessons: s.completedLessons,
        totalLessons: s.totalLessons,
        nextLessonId: s.nextLessonId === null ? null : String(s.nextLessonId),
        completed: s.completed,
        certificateId: s.certificateId === null ? null : String(s.certificateId),
      },
    ]),
  )
}
