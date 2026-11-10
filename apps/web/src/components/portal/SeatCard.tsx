import { getTranslations } from "next-intl/server"

import { Badge } from "@/components/ui/badge"
import { formatSessionDate, formatSessionTime } from "@/lib/storefront/format"
import type { Locale } from "@/modules/_shared"

import type { SeatRow } from "./data"
import { SeatCancel } from "./sessions/SeatCancel"
import type { CancelContext } from "./sessions/types"

const STATUS_VARIANT = { confirmed: "ok", cancelled: "danger", refunded: "neutral" } as const

export interface SeatCardProps {
  seat: SeatRow
  locale: Locale
  /** Cancel data for upcoming confirmed seats (sessions + dashboard pages). */
  cancel?: CancelContext
}

/**
 * One seat. `[data-cancel-slot]` on upcoming confirmed rows holds the cancel
 * button, or the reason it is unavailable (W3-01b).
 */
export async function SeatCard({ seat, locale, cancel }: SeatCardProps) {
  const t = await getTranslations({ locale, namespace: "portal.sessions" })
  const date = formatSessionDate(seat.startsAt, locale)
  const time = formatSessionTime(seat.startsAt, seat.endsAt, locale)
  const slot = seat.upcoming && seat.status === "confirmed"
  return (
    <li
      data-seat-row
      data-enrollment-id={seat.enrollmentId}
      data-status={seat.status}
      data-guest-seat={seat.isGuestSeat ? "true" : "false"}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="font-display text-lg font-semibold leading-tight text-fg">{seat.courseTitle}</h3>
        <p className="text-fg">
          <time dateTime={seat.startsAt}>{date}</time>
          <span className="text-fg-muted"> · {time}</span>
        </p>
        {seat.locationName ? (
          <p className="text-sm text-fg-muted">
            {t("location_label")} : {seat.locationName}
          </p>
        ) : null}
        <p className="text-sm text-fg-muted">{t("order_label", { number: seat.orderNumber })}</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap gap-2">
          <Badge variant={STATUS_VARIANT[seat.status]}>{t(`status.${seat.status}`)}</Badge>
          {seat.isGuestSeat ? (
            <Badge variant="outline" data-guest-badge>
              {seat.guestName ? t("guest_badge", { name: seat.guestName }) : t("guest_badge_unnamed")}
            </Badge>
          ) : null}
          {!seat.upcoming && seat.attendance !== "unknown" ? (
            <Badge variant="neutral">{t(`attendance.${seat.attendance}`)}</Badge>
          ) : null}
        </div>
        {slot ? (
          <div data-cancel-slot data-enrollment-id={seat.enrollmentId} data-booked-by-me={seat.bookedByMe ? "true" : "false"} className="flex flex-col items-start sm:items-end">
            {cancel ? <SeatCancel seat={seat} locale={locale} context={cancel} /> : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
