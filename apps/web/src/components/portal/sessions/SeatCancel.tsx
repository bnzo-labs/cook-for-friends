import { getTranslations } from "next-intl/server"

import type { Locale } from "@/modules/_shared"

import type { SeatRow } from "../data"
import { formatSessionDate } from "@/lib/storefront/format"
import { CancelSeatDialog } from "./CancelSeatDialog"
import type { CancelContext } from "./types"

export interface SeatCancelProps {
  seat: SeatRow
  locale: Locale
  context: CancelContext
}

/** Cancel button (buyer, policy allows) or the reason it is not available. Guests never get a button (Q11). */
export async function SeatCancel({ seat, locale, context }: SeatCancelProps) {
  const info = context.byEnrollment[String(seat.enrollmentId)]
  if (!info) return null
  const t = await getTranslations({ locale, namespace: "portal.sessions.cancel" })

  if (info.kind === "allowed") {
    return (
      <CancelSeatDialog
        enrollmentId={String(seat.enrollmentId)}
        courseTitle={seat.courseTitle}
        dateLabel={formatSessionDate(seat.startsAt, locale)}
        preview={info.preview}
        policyHref={context.policyHref}
      />
    )
  }

  if (info.reason === "NOT_CONFIRMED") return null
  const mail = context.contactEmail
  return (
    <p data-cancel-blocked={info.reason} className="max-w-xs text-sm text-fg-muted sm:text-right">
      {info.reason === "NOT_BUYER"
        ? info.buyerFirstName
          ? t("blocked.not_buyer", { name: info.buyerFirstName })
          : t("blocked.not_buyer_unnamed")
        : info.reason === "SESSION_STARTED"
          ? t("blocked.session_started")
          : mail
            ? t("blocked.self_cancel_disabled")
            : t("blocked.self_cancel_disabled_no_email")}
      {info.reason === "SELF_CANCEL_DISABLED" && mail ? (
        <>
          {" "}
          <a href={`mailto:${mail}`} className="rounded-sm font-medium text-primary underline underline-offset-4">
            {mail}
          </a>
        </>
      ) : null}
    </p>
  )
}
