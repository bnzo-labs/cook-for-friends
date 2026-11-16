import type { UIFieldServerProps } from "payload"

import { isStaff } from "@/modules/identity"

import { CancelSeatControl } from "./CancelSeatControl"

/**
 * W4-07: `enrollments.staffCancel` ui field. Shown to staff on a confirmed seat (or a cancelled
 * seat whose refund is still pending — the preview then offers the retry).
 */
export async function CancelSeatField({ id, i18n, req, data }: UIFieldServerProps & { id?: number | string }) {
  if (id === undefined || id === null || !isStaff(req.user)) return null
  const status = (data as { status?: string } | undefined)?.status
  const outcome = (data as { cancellationOutcome?: string } | undefined)?.cancellationOutcome
  if (status !== "confirmed" && !(status === "cancelled" && outcome === "refund")) return null
  const lang = i18n?.language === "en" ? "en" : "fr"
  const name = String((data as { attendeeName?: string } | undefined)?.attendeeName ?? "")
  return (
    <section aria-label={lang === "en" ? "Cancel seat" : "Annuler la place"} style={{ margin: "16px 0" }} data-testid="enrollment-cancel-seat">
      <CancelSeatControl enrollmentId={id} lang={lang} name={name} />
    </section>
  )
}

export { CancelSeatControl }
export default CancelSeatField
