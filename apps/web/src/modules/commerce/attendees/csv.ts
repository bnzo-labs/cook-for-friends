import type { Locale } from "@/modules/_shared"
import type { AttendeeEntry } from "./list"

const DELIMITER = ";"
const BOM = "﻿"

/** CSV-injection guard + RFC 4180 quoting (`;` delimiter, Excel fr-CA). */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const HEADERS: Record<Locale, string[]> = {
  fr: ["Nom", "Prénom", "Courriel", "Téléphone", "Notes alimentaires", "Statut", "Présence", "Commande", "Réservé par", "Place", "Invité"],
  en: ["Last name", "First name", "Email", "Phone", "Dietary notes", "Status", "Attendance", "Order", "Booked by", "Seat", "Guest"],
}

const STATUS: Record<Locale, Record<string, string>> = {
  fr: { confirmed: "Confirmée", cancelled: "Annulée", refunded: "Remboursée" },
  en: { confirmed: "Confirmed", cancelled: "Cancelled", refunded: "Refunded" },
}

const ATTENDANCE: Record<Locale, Record<string, string>> = {
  fr: { unknown: "", present: "Présent", absent: "Absent" },
  en: { unknown: "", present: "Present", absent: "Absent" },
}

const YES_NO: Record<Locale, [string, string]> = { fr: ["Oui", "Non"], en: ["Yes", "No"] }

function bookedBy(b: { name: string; email: string }): string {
  if (b.name && b.email) return `${b.name} <${b.email}>`
  return b.name || b.email
}

/** UTF-8 BOM + CRLF rows. Pure. */
export function buildAttendeesCsv(entries: AttendeeEntry[], locale: Locale): string {
  const lines = [HEADERS[locale].map(csvCell).join(DELIMITER)]
  for (const { row: r, seatCount } of entries) {
    lines.push(
      [
        r.lastName,
        r.firstName,
        r.email,
        r.phone,
        r.dietaryNotes,
        STATUS[locale][r.enrollmentStatus],
        ATTENDANCE[locale][r.attendance],
        r.orderNumber,
        bookedBy(r.bookedBy),
        `${r.attendeeIndex + 1}/${seatCount}`,
        YES_NO[locale][r.isBuyer ? 1 : 0],
      ]
        .map(csvCell)
        .join(DELIMITER),
    )
  }
  return BOM + lines.join("\r\n") + "\r\n"
}

/** `participants-<course-slug>-<YYYY-MM-DD>.csv`, date in America/Toronto. */
export function attendeesFilename(courseSlug: string, startsAt: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(startsAt),
  )
  const slug = courseSlug.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "session"
  return `participants-${slug}-${day}.csv`
}
