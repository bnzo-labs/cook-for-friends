"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

import { CommentForm } from "./CommentForm"

export interface ReplyToggleProps {
  lessonId: number
  parentId: number
  authorName: string
}

/** "Reply" button that opens an inline form under an approved top-level comment. */
export function ReplyToggle({ lessonId, parentId, authorName }: ReplyToggleProps) {
  const t = useTranslations("portal.comments")
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        aria-label={t("reply_to", { name: authorName })}
        onClick={() => setOpen(true)}
        data-reply-open
      >
        {t("reply")}
      </Button>
    )
  }
  return (
    <div className="mt-2">
      <CommentForm
        lessonId={lessonId}
        parentId={parentId}
        autoFocus
        onPosted={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}
