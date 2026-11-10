import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from "payload"

import type { ID, Locale } from "@/modules/_shared"
import { getCourseLessonsContent, getLessonVideoRef, listCoursesByIds } from "@/modules/catalog"
import { getPathname } from "@/i18n/navigation"
import { enqueueEmail } from "@/modules/notifications"

const relId = (v: unknown): ID | null =>
  v && typeof v === "object" ? ((v as { id?: ID }).id ?? null) : ((v as ID | null | undefined) ?? null)

export const commentApprovedKey = (commentId: ID): string => `comment-approved-${String(commentId)}`

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

/** Absolute, localized player URL for a lesson. */
export function lessonUrl(locale: Locale, courseSlug: string, lessonId: ID): string {
  const path = getPathname({
    locale,
    href: { pathname: "/account/courses/[slug]/[lesson]", params: { slug: courseSlug, lesson: String(lessonId) } },
  })
  return `${siteUrl()}${path}`
}

/** A staff status change records who moderated. Customers cannot change status (field access). */
export const stampModerator: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== "update" || !originalDoc) return data
  if (data.status === undefined || data.status === originalDoc.status) return data
  if (req.user && req.user.collection === "users") return { ...data, moderatedBy: req.user.id }
  return data
}

/**
 * Not-approved → approved: queue one `comment-approved` email to the author.
 * The queued job joins the moderation transaction (`tx`). `idempotencyKey` is
 * stable per comment and a job-table lookup skips a re-approval after
 * approved → pending → approved. Rejection sends nothing. Comment body is never
 * logged or put in the email.
 */
export const notifyAuthorOnApproval: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== "update" || doc.status !== "approved" || previousDoc?.status === "approved") return doc

  const key = commentApprovedKey(doc.id)
  // approved → pending → approved must not email twice. A failed lookup must not block moderation.
  const already = await req.payload
    .find({
      collection: "payload-jobs",
      where: { "input.idempotencyKey": { equals: key } },
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    .catch((err: unknown) => {
      req.payload.logger.warn({ err, commentId: doc.id }, "comments: approval email dedupe lookup failed")
      return null
    })
  if (already && already.docs.length > 0) return doc

  const customerId = relId(doc.customer)
  const lessonId = relId(doc.lesson)
  if (customerId === null || lessonId === null) return doc

  const customer = await req.payload.findByID({
    collection: "customers",
    id: customerId,
    depth: 0,
    select: { email: true, firstName: true, preferredLocale: true },
    overrideAccess: true,
    req,
  })
  const locale: Locale = customer.preferredLocale === "en" ? "en" : "fr"

  const ref = await getLessonVideoRef(lessonId)
  const course = ref ? (await listCoursesByIds([ref.courseId], locale))[0] : undefined
  const lesson = ref ? (await getCourseLessonsContent(ref.courseId, locale)).find((l) => String(l.id) === String(lessonId)) : undefined
  if (!course || !lesson) {
    // Course unpublished/archived: approval stands, no email possible.
    req.payload.logger.warn({ commentId: doc.id, lessonId }, "comments: approval email skipped, course or lesson unavailable")
    return doc
  }

  await enqueueEmail({
    template: "comment-approved",
    to: customer.email,
    locale,
    data: {
      customerFirstName: customer.firstName ?? undefined,
      courseTitle: course.title,
      lessonTitle: lesson.title,
      lessonUrl: lessonUrl(locale, course.slug, lessonId),
    },
    idempotencyKey: key,
    tx: { req },
  })
  return doc
}
