import type { Locale } from "@/modules/_shared"

const intlLocale = (locale: Locale): string => (locale === "fr" ? "fr-CA" : "en-CA")

/** Price in cents → localized CAD string. */
export function formatMoney(amountCents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amountCents / 100)
}

/** Long date in the studio's timezone. No CSS capitalisation: French weekdays/months stay lowercase. */
export function formatSessionDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate))
}

export function formatSessionTime(startsAt: string, endsAt: string, locale: Locale): string {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  })
  return `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`
}
