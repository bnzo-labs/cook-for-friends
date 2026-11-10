import { getTranslations } from "next-intl/server"

import type { ID, Locale } from "@/modules/_shared"
import { listLessonComments } from "@/modules/learning"

import { CommentForm } from "./CommentForm"
import { CommentItem } from "./CommentItem"

export interface CommentsSectionProps {
  lessonId: ID
  customerId: ID
  locale: Locale
}

/** Thread under a lesson (server). Own pending comments are included by `listLessonComments`. */
export async function CommentsSection({ lessonId, customerId, locale }: CommentsSectionProps) {
  const [t, result] = await Promise.all([
    getTranslations({ locale, namespace: "portal.comments" }),
    listLessonComments({ lessonId, customerId, locale }),
  ])
  // Not entitled / draft course: the page already gates; render nothing rather than a broken form.
  if (!result.ok) return null
  const comments = result.data
  const labels = {
    you: t("you"),
    pending: t("status_pending"),
    rejected: t("status_rejected"),
    replies: t("replies_label"),
  }

  return (
    <section aria-labelledby="lesson-comments-heading" data-comments className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="lesson-comments-heading" className="font-display text-xl font-semibold text-fg">
          {t("heading")}
        </h2>
        <p className="max-w-prose text-fg-muted">{t("intro")}</p>
      </div>

      {comments.length > 0 ? (
        <ol aria-label={t("list_label")} className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              key={String(comment.id)}
              comment={comment}
              lessonId={Number(lessonId)}
              locale={locale}
              labels={labels}
              canReply
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-card border border-dashed border-border bg-surface p-5 text-fg-muted" data-comments-empty>
          {t("empty")}
        </p>
      )}

      <CommentForm lessonId={Number(lessonId)} />
    </section>
  )
}
