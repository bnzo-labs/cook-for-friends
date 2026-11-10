"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRef, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { formatMoney } from "@/lib/storefront/format"
import type { Locale } from "@/modules/_shared"

import { formatDateTime, formatPercent } from "../format"
import type { CancelOutcome, CancelPreviewData } from "./types"

export interface CancelSeatDialogProps {
  enrollmentId: string
  courseTitle: string
  dateLabel: string
  preview: CancelPreviewData
  policyHref: string | null
}

type Failure = "conflict" | "upstream" | "generic"
type CancelResponse = { ok: true; data: { outcome: CancelOutcome; amount: number } } | { ok: false }

const FAILURE_BY_STATUS: Record<number, Failure> = { 409: "conflict", 502: "upstream" }

async function requestCancel(enrollmentId: string): Promise<{ outcome: CancelOutcome; amount: number } | { failure: Failure }> {
  try {
    const res = await fetch(`/api/enrollments/${encodeURIComponent(enrollmentId)}/cancel`, {
      method: "POST",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    })
    if (!res.ok) return { failure: FAILURE_BY_STATUS[res.status] ?? "generic" }
    const body = (await res.json()) as CancelResponse
    return body.ok ? body.data : { failure: "generic" }
  } catch {
    return { failure: "generic" }
  }
}

/**
 * Cancel one seat. The dialog states the exact outcome from the server-side
 * `previewCancellation` (refund amount, credit or nothing) before the buyer confirms.
 */
export function CancelSeatDialog({ enrollmentId, courseTitle, dateLabel, preview, policyHref }: CancelSeatDialogProps) {
  const t = useTranslations("portal.sessions.cancel")
  const locale = useLocale() as Locale
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const inFlight = useRef(false)

  const values = {
    amount: formatMoney(preview.amount, locale),
    percent: formatPercent(preview.percent, locale),
    hours: Math.max(0, Math.floor(preview.hoursBefore)),
  }

  async function confirm() {
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setFailure(null)
    const r = await requestCancel(enrollmentId)
    if ("failure" in r) {
      setFailure(r.failure)
      setSubmitting(false)
      inFlight.current = false
      if (r.failure === "conflict") {
        // Already cancelled or too late: the page is stale, reload it.
        toast.error(t("error.conflict"))
        setOpen(false)
        router.refresh()
      }
      return
    }
    toast.success(t(`success.${r.outcome}`, { amount: formatMoney(r.amount, locale) }))
    setOpen(false)
    setSubmitting(false)
    inFlight.current = false
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (submitting ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" data-cancel-trigger aria-label={t("trigger_aria", { course: courseTitle, date: dateLabel })}>
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("close")} data-cancel-dialog data-outcome={preview.outcome}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {courseTitle} · {dateLabel}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-fg" data-cancel-outcome>
          <p className="font-medium">{t(`outcome.${preview.outcome}`, values)}</p>
          {preview.outcome === "credit" ? <p className="text-sm text-fg-muted">{t("credit_emailed")}</p> : null}
          {preview.outcome === "none" ? <p className="text-sm text-fg-muted">{t("none_hint", values)}</p> : null}
          {preview.deadlineNextTier ? (
            <p className="text-sm text-fg-muted">{t("deadline", { date: formatDateTime(preview.deadlineNextTier, locale) })}</p>
          ) : null}
          {policyHref ? (
            <a href={policyHref} className="w-fit rounded-sm text-sm font-medium text-primary underline underline-offset-4">
              {t("policy_link")}
            </a>
          ) : null}
        </div>
        {failure && failure !== "conflict" ? (
          <p role="alert" data-cancel-error className="rounded-control border border-danger px-3 py-2 text-sm font-medium text-danger">
            {t(`error.${failure}`)}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={submitting}>
              {t("keep")}
            </Button>
          </DialogClose>
          <Button onClick={confirm} loading={submitting} data-cancel-confirm>
            {failure === "upstream" ? t("retry") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
