import type { Locale } from "@/modules/_shared"

import type { SeatRow } from "./data"
import { SeatCard } from "./SeatCard"

export interface SeatListProps {
  seats: SeatRow[]
  locale: Locale
  label: string
}

export function SeatList({ seats, locale, label }: SeatListProps) {
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {seats.map((seat) => (
        <SeatCard key={String(seat.enrollmentId)} seat={seat} locale={locale} />
      ))}
    </ol>
  )
}
