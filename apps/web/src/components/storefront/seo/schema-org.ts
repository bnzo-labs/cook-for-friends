import type { CourseView, SessionSummary } from "@/modules/catalog"
import type { Locale } from "@/i18n/locales"

/** JSON-LD builders (schema.org Course + Event). Pure: no I/O. */

export type JsonLdObject = Record<string, unknown>

const HREFLANG: Record<Locale, string> = { fr: "fr-CA", en: "en-CA" }
const TIME_ZONE = "America/Toronto"
const REGION = "QC"
const COUNTRY = "CA"

/** Serialize for a `<script type="application/ld+json">`: `<` becomes `<`. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

/** ISO instant -> ISO local time with explicit America/Toronto offset. */
export function toTorontoIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${iso}`)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "longOffset",
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  const offset = (p.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00"
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`
}

function priceString(cents: number): string {
  return (cents / 100).toFixed(2)
}

export type CourseJsonLdInput = {
  course: CourseView
  locale: Locale
  url: string
  providerName: string
  providerUrl: string
  image?: string | null
}

export function buildCourseJsonLd(i: CourseJsonLdInput): JsonLdObject {
  const { course } = i
  const description = course.seo.description ?? course.summary
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    ...(description ? { description } : {}),
    url: i.url,
    inLanguage: HREFLANG[i.locale],
    ...(i.image ? { image: i.image } : {}),
    provider: { "@type": "Organization", name: i.providerName, url: i.providerUrl },
    offers: {
      "@type": "Offer",
      category: "Paid",
      price: priceString(course.price.amount),
      priceCurrency: "CAD",
      url: i.url,
    },
  }
}

export type EventJsonLdInput = {
  course: CourseView
  session: SessionSummary
  /** Seats left (commerce.getAvailableSeats), already loaded by the page. */
  availableSeats: number
  locale: Locale
  url: string
  providerName: string
  providerUrl: string
  image?: string | null
}

export function buildEventJsonLd(i: EventJsonLdInput): JsonLdObject {
  const { course, session } = i
  const loc = session.location
  const cancelled = session.status === "cancelled"
  const description = course.seo.description ?? course.summary
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: course.title,
    ...(description ? { description } : {}),
    startDate: toTorontoIso(session.startsAt),
    endDate: toTorontoIso(session.endsAt),
    eventStatus: cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    inLanguage: HREFLANG[i.locale],
    ...(i.image ? { image: i.image } : {}),
    location: {
      "@type": "Place",
      ...(loc.name ? { name: loc.name } : {}),
      address: {
        "@type": "PostalAddress",
        ...(loc.address ? { streetAddress: loc.address } : {}),
        ...(loc.city ? { addressLocality: loc.city } : {}),
        ...(loc.postalCode ? { postalCode: loc.postalCode } : {}),
        addressRegion: REGION,
        addressCountry: COUNTRY,
      },
    },
    organizer: { "@type": "Organization", name: i.providerName, url: i.providerUrl },
    offers: {
      "@type": "Offer",
      price: priceString(course.price.amount),
      priceCurrency: "CAD",
      url: i.url,
      availability:
        !cancelled && i.availableSeats > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    },
  }
}
