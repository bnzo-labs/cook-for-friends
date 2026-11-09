import type { LessonContent } from "@/modules/catalog"
import type { ID, ISODate } from "@/modules/_shared"

/** CONTRACT 1.3 §4 `@/modules/learning` (CCR-W3-6). */
export type CertificateView = {
  id: ID
  courseId: ID
  courseTitle: string
  verificationCode: string
  issuedAt: ISODate
}

/** Public lookup result: no email, no ids. */
export type CertificatePublicView = {
  code: string
  customerName: string
  courseTitle: { fr: string; en: string }
  issuedAt: ISODate
}

export type CoursePlayerView = {
  courseId: ID
  slug: string
  title: string
  certificateEnabled: boolean
  lessons: (LessonContent & { completed: boolean; positionSec: number })[]
  progress: { completed: number; total: number }
  certificate: CertificateView | null
}

export type CourseProgressSummary = {
  courseId: ID
  slug: string
  title: string
  completedLessons: number
  totalLessons: number
  nextLessonId: ID | null
  completed: boolean
  certificateId: ID | null
}

export type RecordProgressResult = { courseCompleted: boolean; certificateId?: ID }

/** Who is calling a route: a signed-in customer, staff, or nobody. */
export type Actor = { kind: "customer"; id: ID } | { kind: "staff" } | null
