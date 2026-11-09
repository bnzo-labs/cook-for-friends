import { describe, expect, it } from "vitest"
import type { CourseView, SessionSummary } from "@/modules/catalog"
import {
  buildCourseJsonLd,
  buildEventJsonLd,
  serializeJsonLd,
  toTorontoIso,
  type JsonLdObject,
} from "../schema-org"

/** Minimal hand-written schema check (no validator dependency). */
function expectType(o: JsonLdObject, type: string, required: string[]) {
  expect(o["@context"]).toBe("https://schema.org")
  expect(o["@type"]).toBe(type)
  for (const key of required) expect(o[key], `${type}.${key}`).toBeDefined()
}

const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

const course = {
  id: 1,
  slug: "pain-au-levain",
  format: "in_person",
  title: "Pain au levain",
  summary: "Un cours <b>de pain</b>",
  level: "beginner",
  durationMinutes: 180,
  price: { amount: 12500, currency: "cad" },
  heroImageUrl: null,
  isLocaleFallback: false,
  description: null,
  gallery: [],
  certificateEnabled: false,
  seo: { title: null, description: null },
  upcomingSessions: [],
  lessons: [],
} satisfies CourseView

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 10,
  startsAt: "2026-12-05T15:00:00.000Z",
  endsAt: "2026-12-05T18:00:00.000Z",
  location: { name: "Atelier", address: "1 rue Test", city: "Montréal", postalCode: "H2X 1Y1", mapsUrl: null },
  level: "beginner",
  capacity: 8,
  status: "scheduled",
  ...over,
})

const base = { locale: "fr" as const, url: "https://x.test/fr/cours/pain-au-levain", providerName: "Cook for Friends", providerUrl: "https://x.test" }

describe("toTorontoIso", () => {
  it("uses -05:00 in winter and -04:00 in summer", () => {
    expect(toTorontoIso("2026-12-05T15:00:00.000Z")).toBe("2026-12-05T10:00:00-05:00")
    expect(toTorontoIso("2026-07-05T15:00:00.000Z")).toBe("2026-07-05T11:00:00-04:00")
  })
  it("throws on garbage", () => {
    expect(() => toTorontoIso("nope")).toThrow()
  })
})

describe("buildCourseJsonLd", () => {
  it("emits a valid Course", () => {
    const o = buildCourseJsonLd({ ...base, course })
    expectType(o, "Course", ["name", "description", "provider", "inLanguage", "offers"])
    expect(o.inLanguage).toBe("fr-CA")
    expect(o.provider).toMatchObject({ "@type": "Organization", name: "Cook for Friends" })
    expect(o.offers).toMatchObject({ "@type": "Offer", price: "125.00", priceCurrency: "CAD" })
  })
})

describe("buildEventJsonLd", () => {
  it("emits a valid in-person Event with seats in stock", () => {
    const o = buildEventJsonLd({ ...base, course, session: session(), availableSeats: 3 })
    expectType(o, "Event", ["name", "startDate", "endDate", "eventStatus", "eventAttendanceMode", "location", "offers"])
    expect(String(o.startDate)).toMatch(ISO_OFFSET)
    expect(String(o.endDate)).toMatch(ISO_OFFSET)
    expect(o.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode")
    expect(o.eventStatus).toBe("https://schema.org/EventScheduled")
    expect(o.location).toMatchObject({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "Montréal", postalCode: "H2X 1Y1" },
    })
    expect(o.offers).toMatchObject({ availability: "https://schema.org/InStock" })
  })
  it("marks sold out and cancelled", () => {
    const soldOut = buildEventJsonLd({ ...base, course, session: session(), availableSeats: 0 })
    expect(soldOut.offers).toMatchObject({ availability: "https://schema.org/SoldOut" })
    const cancelled = buildEventJsonLd({ ...base, course, session: session({ status: "cancelled" }), availableSeats: 5 })
    expect(cancelled.eventStatus).toBe("https://schema.org/EventCancelled")
    expect(cancelled.offers).toMatchObject({ availability: "https://schema.org/SoldOut" })
  })
})

describe("serializeJsonLd", () => {
  it("escapes < so a script tag cannot be closed", () => {
    const out = serializeJsonLd(buildCourseJsonLd({ ...base, course }))
    expect(out).not.toContain("<")
    expect(out).toContain("\\u003cb>")
    expect(JSON.parse(out).description).toBe("Un cours <b>de pain</b>")
  })
})
