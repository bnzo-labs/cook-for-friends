import type { Locale } from "@/modules/_shared"

import type { SeatRow } from "./data"
import { SeatCard } from "./SeatCard"
import type { CancelContext } from "./sessions/types"

export interface SeatListProps {
  seats: SeatRow[]
  locale: Locale
  label: string
  cancel?: CancelContext
}

export function SeatList({ seats, locale, label, cancel }: SeatListProps) {
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {seats.map((seat) => (
        <SeatCard key={String(seat.enrollmentId)} seat={seat} locale={locale} cancel={cancel} />
      ))}
    </ol>
  )
}
