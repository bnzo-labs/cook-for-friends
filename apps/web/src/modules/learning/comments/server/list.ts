import type { ID, Locale, Result } from "@/modules/_shared"
import { hasActiveEntitlement } from "@/modules/access"
import { getLessonVideoRef } from "@/modules/catalog"
import { getPayload } from "@/lib/payload"

import type { CommentView } from "../types"
import { authorDisplay } from "./display"

const MAX_COMMENTS = 500
const relId = (v: unknown): ID | null =>
  v && typeof v === "object" ? ((v as { id?: ID }).id ?? null) : ((v as ID | null | undefined) ?? null)

type Row = {
  id: ID
  body: string
  status: "approved" | "pending" | "rejected"
  createdAt: string
  customer: unknown
  parent: unknown
}

/**
 * Threaded comments for a lesson: approved ones plus the caller's own
 * pending/rejected ones (flagged via `status` + `isOwn`). Oldest first, replies
 * under their parent. Entitlement required. Never exposes emails or customer ids.
 * `locale` only picks the fallback author label (default fr).
 */
export async function listLessonComments(i: {
  lessonId: ID
  customerId: ID
  locale?: Locale
}): Promise<Result<CommentView[]>> {
  const locale = i.locale ?? "fr"
  const ref = await getLessonVideoRef(i.lessonId)
  if (!ref || ref.courseStatus === "draft") return { ok: false, error: { code: "FORBIDDEN" } }
  if (!(await hasActiveEntitlement(i.customerId, ref.courseId))) return { ok: false, error: { code: "FORBIDDEN" } }

  const payload = await getPayload()
  const res = await payload.find({
    collection: "comments",
    where: {
      and: [
        { lesson: { equals: i.lessonId } },
        { or: [{ status: { equals: "approved" } }, { customer: { equals: i.customerId } }] },
      ],
    },
    sort: "createdAt",
    depth: 0,
    limit: MAX_COMMENTS,
    pagination: false,
    overrideAccess: true,
  })
  const rows = res.docs as unknown as Row[]

  const authorIds = [...new Set(rows.map((r) => relId(r.customer)).filter((v): v is ID => v !== null))]
  const authors = new Map<string, { firstName?: string | null; lastName?: string | null }>()
  if (authorIds.length > 0) {
    const found = await payload.find({
      collection: "customers",
      where: { id: { in: authorIds } },
      select: { firstName: true, lastName: true },
      depth: 0,
      limit: authorIds.length,
      pagination: false,
      overrideAccess: true,
    })
    for (const c of found.docs) authors.set(String(c.id), c)
  }

  const toView = (r: Row): CommentView => {
    const authorId = relId(r.customer)
    const a = authorId === null ? undefined : authors.get(String(authorId))
    return {
      id: r.id,
      body: r.body,
      authorDisplay: authorDisplay(a?.firstName, a?.lastName, locale),
      createdAt: r.createdAt,
      status: r.status,
      isOwn: authorId !== null && String(authorId) === String(i.customerId),
      replies: [],
    }
  }

  const roots = new Map<string, CommentView>()
  const order: CommentView[] = []
  for (const r of rows) {
    if (relId(r.parent) !== null) continue
    const v = toView(r)
    roots.set(String(r.id), v)
    order.push(v)
  }
  // Replies whose parent is not visible to this caller (e.g. parent later rejected) are dropped.
  for (const r of rows) {
    const pid = relId(r.parent)
    if (pid === null) continue
    roots.get(String(pid))?.replies.push(toView(r))
  }
  return { ok: true, data: order }
}
