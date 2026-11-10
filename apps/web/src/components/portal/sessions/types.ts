export type CancelOutcome = "refund" | "credit" | "none"
export type CancelBlockReason = "NOT_BUYER" | "SELF_CANCEL_DISABLED" | "SESSION_STARTED" | "NOT_CONFIRMED"

/** Server-computed `previewCancellation` result, trimmed to what the dialog shows. */
export type CancelPreviewData = {
  outcome: CancelOutcome
  /** Cents. */
  amount: number
  percent: number
  hoursBefore: number
  /** ISO instant after which the outcome gets worse. */
  deadlineNextTier: string | null
}

export type CancelInfo =
  | { kind: "allowed"; preview: CancelPreviewData }
  | { kind: "blocked"; reason: CancelBlockReason; buyerFirstName: string | null }

/** Serializable per-page context for the cancel slot (keys are enrollment ids). */
export type CancelContext = {
  byEnrollment: Record<string, CancelInfo>
  contactEmail: string | null
  /** Localized cancellation policy page, or null while unset/unpublished. */
  policyHref: string | null
}
