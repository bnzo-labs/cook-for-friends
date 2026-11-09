import { hasActiveEntitlement } from "@/modules/access"
import type { ID, Result } from "@/modules/_shared"
import { getLessonVideoRef } from "@/modules/catalog"
import { consumeRateLimit } from "@/modules/identity"
import { getPayload } from "@/lib/payload"

import { COMMENT_RATE_LIMIT } from "../constants"
import { postCommentSchema } from "../validators"

const toId = (v: string | number): ID => (typeof v === "string" ? Number(v) : v)
const invalid = (path: string, message: string): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", issues: [{ path, message }] },
})

/**
 * Entitled customer posts a comment (or a one-level reply to an approved
 * comment of the same lesson). Always stored `pending`. The body is stored as
 * plain text, verbatim after trimming. The body is never logged.
 *
 * Errors: VALIDATION (shape, parent), FORBIDDEN (no active entitlement; unknown
 * lesson is reported the same way), CONFLICT `RATE_LIMITED` (10/customer/h).
 */
export async function postComment(i: {
  customerId: ID
  lessonId: ID
  body: string
  parentId?: ID
}): Promise<Result<void>> {
  const parsed = postCommentSchema.safeParse({ lessonId: i.lessonId, body: i.body, parentId: i.parentId })
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        issues: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: `learning.comments.errors.${String(x.path[0] ?? "body")}` })),
      },
    }
  }
  const lessonId = toId(parsed.data.lessonId)
  const parentId = parsed.data.parentId === undefined ? undefined : toId(parsed.data.parentId)

  const ref = await getLessonVideoRef(lessonId)
  if (!ref || ref.courseStatus === "draft") return { ok: false, error: { code: "FORBIDDEN" } }
  if (!(await hasActiveEntitlement(i.customerId, ref.courseId))) return { ok: false, error: { code: "FORBIDDEN" } }

  const limit = await consumeRateLimit({
    scope: "email",
    namespace: COMMENT_RATE_LIMIT.namespace,
    key: `customer-${String(i.customerId)}`,
    limit: COMMENT_RATE_LIMIT.limit,
    windowSeconds: COMMENT_RATE_LIMIT.windowSeconds,
  })
  if (!limit.allowed) return { ok: false, error: { code: "CONFLICT", reason: "RATE_LIMITED" } }

  const payload = await getPayload()
  if (parentId !== undefined) {
    const found = await payload.find({
      collection: "comments",
      where: { id: { equals: parentId } },
      depth: 0,
      limit: 1,
      pagination: false,
      select: { status: true, lesson: true, parent: true },
      overrideAccess: true,
    })
    const parent = found.docs[0]
    if (!parent) return invalid("parentId", "learning.comments.errors.parent_not_found")
    const parentLesson = typeof parent.lesson === "object" ? parent.lesson.id : parent.lesson
    if (parent.status !== "approved") return invalid("parentId", "learning.comments.errors.parent_not_approved")
    if (String(parentLesson) !== String(lessonId)) return invalid("parentId", "learning.comments.errors.parent_other_lesson")
    if (parent.parent) return invalid("parentId", "learning.comments.errors.parent_nested")
  }

  await payload.create({
    collection: "comments",
    data: {
      lesson: lessonId as number,
      customer: i.customerId as number,
      body: parsed.data.body,
      status: "pending",
      ...(parentId !== undefined ? { parent: parentId as number } : {}),
    },
    depth: 0,
    overrideAccess: true,
  })
  return { ok: true, data: undefined }
}
