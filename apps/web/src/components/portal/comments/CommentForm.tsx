"use client"

import { useRouter } from "next/navigation"
import { useId, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

import { postComment, type CommentErrorKind } from "./comments-api"

/** Mirrors COMMENT_MAX_LENGTH in `@/modules/learning/comments/constants` (server enforces it). */
export const COMMENT_MAX = 2000

export interface CommentFormProps {
  lessonId: number
  parentId?: number
  /** Called after a successful post (reply form closes itself). */
  onPosted?: () => void
  onCancel?: () => void
  autoFocus?: boolean
}

const ERROR_KEY: Record<CommentErrorKind, string> = {
  rate_limited: "error_rate_limited",
  forbidden: "error_forbidden",
  validation: "error_validation",
  unauthorized: "error_unauthorized",
  generic: "error_generic",
}

/** Plain textarea form. The body is sent as text; the server stores it as text. */
export function CommentForm({ lessonId, parentId, onPosted, onCancel, autoFocus }: CommentFormProps) {
  const t = useTranslations("portal.comments")
  const router = useRouter()
  const fieldId = useId()
  const errorId = `${fieldId}-error`
  const noteId = `${fieldId}-note`
  const [body, setBody] = useState("")
  const [error, setError] = useState<CommentErrorKind | null>(null)
  const [posted, setPosted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLTextAreaElement>(null)
  const trimmed = body.trim()
  const reply = parentId !== undefined

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || trimmed.length === 0) return
    setBusy(true)
    setError(null)
    const res = await postComment({ lessonId, body: trimmed, ...(reply ? { parentId } : {}) })
    setBusy(false)
    if (!res.ok) {
      setError(res.kind)
      ref.current?.focus()
      return
    }
    setBody("")
    setPosted(true)
    startTransition(() => router.refresh())
    onPosted?.()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-comment-form noValidate>
      <label htmlFor={fieldId} className="text-sm font-medium text-fg">
        {reply ? t("reply_form_label") : t("form_label")}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        name="body"
        rows={reply ? 3 : 4}
        maxLength={COMMENT_MAX}
        value={body}
        autoFocus={autoFocus}
        disabled={busy}
        onChange={(e) => {
          setBody(e.target.value)
          if (posted) setPosted(false)
        }}
        aria-invalid={error !== null}
        aria-describedby={error ? `${errorId} ${noteId}` : noteId}
        className={[
          "w-full resize-y rounded-control border bg-surface px-3 py-2 text-fg",
          "placeholder:text-fg-muted",
          error ? "border-danger" : "border-border hover:border-fg/40",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "disabled:opacity-60",
        ].join(" ")}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={noteId} className="text-sm text-fg-muted">
          {t("char_count", { count: body.length, max: COMMENT_MAX })}
        </p>
        <div className="flex gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {t("cancel")}
            </Button>
          ) : null}
          <Button type="submit" loading={busy} disabled={trimmed.length === 0}>
            {busy ? t("posting") : reply ? t("reply_submit") : t("submit")}
          </Button>
        </div>
      </div>
      <p id={errorId} role="alert" className={error ? "text-sm text-danger" : "sr-only"}>
        {error ? t(ERROR_KEY[error]) : ""}
      </p>
      <p role="status" className={posted && !reply ? "text-sm text-fg-muted" : "sr-only"} data-comment-posted>
        {posted ? t("posted_pending") : ""}
      </p>
    </form>
  )
}
