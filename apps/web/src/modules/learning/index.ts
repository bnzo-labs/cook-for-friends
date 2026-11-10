import type { CollectionConfig } from "payload"

import { Certificates } from "./collections/certificates"
import { Comments } from "./collections/comments"
import { LessonProgress } from "./collections/lesson-progress"

export const learningCollections: CollectionConfig[] = [LessonProgress, Certificates, Comments]

export * from "./comments"

// W3-03a — learning core (CONTRACT 1.3 §4, CCR-W3-6)
export { getRequestActor } from "./server/actor"
export {
  getCertificateForPdf,
  issueCertificateIfComplete,
  listCustomerCertificates,
  verifyCertificate,
} from "./server/certificates"
export { getMaterialSignedUrl } from "./server/materials"
export { getCoursePlayer, getCourseProgressSummaries, recordProgress } from "./server/progress"
export { renderCertificatePdf } from "./server/pdf"
export type {
  Actor,
  CertificatePublicView,
  CertificateView,
  CoursePlayerView,
  CourseProgressSummary,
  RecordProgressResult,
} from "./types"
