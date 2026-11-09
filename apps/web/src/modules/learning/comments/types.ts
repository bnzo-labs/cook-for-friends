import type { ID, ISODate } from "@/modules/_shared"

/** CONTRACT §4 (CCR-W3-6). `body` is plain text: render as text, never as HTML. No emails, no customer ids. */
export type CommentView = {
  id: ID
  body: string
  authorDisplay: string
  createdAt: ISODate
  status: "approved" | "pending" | "rejected"
  isOwn: boolean
  replies: CommentView[]
}
