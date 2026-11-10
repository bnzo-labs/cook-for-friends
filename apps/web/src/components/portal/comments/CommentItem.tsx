import { Badge } from "@/components/ui/badge"
import type { Locale } from "@/modules/_shared"
import type { CommentView } from "@/modules/learning"

import { ReplyToggle } from "./ReplyToggle"

export interface CommentItemProps {
  comment: CommentView
  lessonId: number
  locale: Locale
  labels: { you: string; pending: string; rejected: string; replies: string }
  /** Replies are one level deep: only top-level approved comments take a reply. */
  canReply: boolean
}

const intlLocale = (locale: Locale): string => (locale === "fr" ? "fr-CA" : "en-CA")

function formatWhen(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}

/**
 * One comment. The body is a React text node (escaped) with `pre-wrap`: never
 * `dangerouslySetInnerHTML`, so `<img onerror>` shows up as literal text.
 */
export function CommentItem({ comment, lessonId, locale, labels, canReply }: CommentItemProps) {
  const author = comment.isOwn ? labels.you : comment.authorDisplay
  return (
    <li data-comment-id={comment.id} data-comment-status={comment.status} className="flex flex-col gap-2">
      <article className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-fg">{author}</span>
          <time dateTime={comment.createdAt} className="text-sm text-fg-muted">
            {formatWhen(comment.createdAt, locale)}
          </time>
          {comment.status === "pending" ? <Badge variant="low">{labels.pending}</Badge> : null}
          {comment.status === "rejected" ? <Badge variant="danger">{labels.rejected}</Badge> : null}
        </header>
        <p className="whitespace-pre-wrap break-words text-fg" data-comment-body>
          {comment.body}
        </p>
        {canReply && comment.status === "approved" ? (
          <div>
            <ReplyToggle lessonId={lessonId} parentId={Number(comment.id)} authorName={author} />
          </div>
        ) : null}
      </article>
      {comment.replies.length > 0 ? (
        <ol aria-label={labels.replies} className="ml-4 flex flex-col gap-3 border-l-2 border-border pl-4 sm:ml-8">
          {comment.replies.map((reply) => (
            <CommentItem
              key={String(reply.id)}
              comment={reply}
              lessonId={lessonId}
              locale={locale}
              labels={labels}
              canReply={false}
            />
          ))}
        </ol>
      ) : null}
    </li>
  )
}
