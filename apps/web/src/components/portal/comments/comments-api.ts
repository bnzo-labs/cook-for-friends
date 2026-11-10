/** Browser-side wrapper for POST /api/comments (CONTRACT §5.1) with error mapping. */
export type CommentErrorKind = "rate_limited" | "forbidden" | "validation" | "unauthorized" | "generic"

export type PostCommentResult = { ok: true } | { ok: false; kind: CommentErrorKind }

export function commentErrorKind(status: number): CommentErrorKind {
  switch (status) {
    case 400:
      return "validation"
    case 401:
      return "unauthorized"
    case 403:
      return "forbidden"
    case 429:
      return "rate_limited"
    default:
      return "generic"
  }
}

export async function postComment(input: {
  lessonId: number
  body: string
  parentId?: number
}): Promise<PostCommentResult> {
  try {
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    })
    return res.ok ? { ok: true } : { ok: false, kind: commentErrorKind(res.status) }
  } catch {
    return { ok: false, kind: "generic" }
  }
}
