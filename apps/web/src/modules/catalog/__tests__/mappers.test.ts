import { describe, expect, it } from "vitest"

import {
  computeLocaleFallback,
  mapCancellationPolicy,
  mapCommerceRecord,
  mapCourseCard,
  mapSessionSummary,
  mapSiteSettings,
  pickLocalized,
} from "../server/mappers"
import { buildSyncData } from "../server/stripe-sync-record"

describe("pickLocalized", () => {
  it("uses requested locale when present", () => {
    expect(pickLocalized({ fr: "a", en: "b" }, "en")).toEqual({ value: "b", fellBack: false })
  })
  it("falls back to fr for empty/missing EN", () => {
    expect(pickLocalized({ fr: "a", en: "" }, "en")).toEqual({ value: "a", fellBack: true })
    expect(pickLocalized({ fr: "a" }, "en")).toEqual({ value: "a", fellBack: true })
  })
  it("never reports fallback for fr", () => {
    expect(pickLocalized({ fr: "a" }, "fr")).toEqual({ value: "a", fellBack: false })
    expect(pickLocalized(null, "fr")).toEqual({ value: null, fellBack: false })
  })
})

describe("computeLocaleFallback", () => {
  it("flags missing EN title", () => {
    expect(computeLocaleFallback({ fr: "t" }, { fr: "s", en: "s" }, "en")).toBe(true)
  })
  it("flags missing EN summary only when FR has one", () => {
    expect(computeLocaleFallback({ fr: "t", en: "t" }, { fr: "s" }, "en")).toBe(true)
    expect(computeLocaleFallback({ fr: "t", en: "t" }, {}, "en")).toBe(false)
  })
  it("is false for complete EN and for fr", () => {
    expect(computeLocaleFallback({ fr: "t", en: "t" }, { fr: "s", en: "s" }, "en")).toBe(false)
    expect(computeLocaleFallback({ fr: "t" }, {}, "fr")).toBe(false)
  })
})

describe("mapCourseCard", () => {
  const doc = {
    id: 3,
    format: "in_person",
    slug: { fr: "pain", en: "bread" },
    title: { fr: "Pain", en: "Bread" },
    summary: { fr: "Résumé" },
    level: "beginner",
    durationMinutes: 240,
    price: 11000,
    heroImage: { id: 9, url: "https://img/x.jpg" },
  }
  it("maps EN with summary fallback badge", () => {
    const c = mapCourseCard(doc, "en", "2030-01-01T00:00:00.000Z")
    expect(c).toMatchObject({
      slug: "bread",
      title: "Bread",
      summary: "Résumé",
      isLocaleFallback: true,
      price: { amount: 11000, currency: "cad" },
      heroImageUrl: "https://img/x.jpg",
      nextSessionAt: "2030-01-01T00:00:00.000Z",
    })
  })
  it("tolerates an unpopulated hero image", () => {
    expect(mapCourseCard({ ...doc, heroImage: 9 }, "fr", null).heroImageUrl).toBeNull()
  })
})

describe("mapSessionSummary", () => {
  it("prefers session level over course level", () => {
    const base = { id: 1, startsAt: "a", endsAt: "b", capacity: 4, status: "scheduled", location: { city: "MTL" } }
    expect(mapSessionSummary({ ...base, level: "advanced" }, "beginner").level).toBe("advanced")
    expect(mapSessionSummary(base, "beginner").level).toBe("beginner")
    expect(mapSessionSummary(base, null).location.city).toBe("MTL")
  })
})

describe("mapCommerceRecord", () => {
  it("returns both locales, FR into missing EN, optional hero", () => {
    const r = mapCommerceRecord({
      id: 1,
      format: "online",
      status: "published",
      price: 4900,
      title: { fr: "T", en: "U" },
      summary: { fr: "S" },
      slug: { fr: "t", en: "u" },
      stripeProductId: "prod_1",
      stripePriceId: null,
      stripeSyncStatus: "weird",
    })
    expect(r.summary).toEqual({ fr: "S", en: "S" })
    expect(r.stripeSyncStatus).toBe("pending")
    expect(r.stripePriceId).toBeNull()
    expect("heroImageUrl" in r).toBe(false)
  })
})

describe("mapSiteSettings / mapCancellationPolicy", () => {
  it("defaults when empty", () => {
    expect(mapSiteSettings(null)).toMatchObject({
      maxSeatsPerPurchase: 4,
      holdMinutes: 15,
      waitlistNotifyCount: 3,
      reminderOffsetsHours: [48, 24],
    })
  })
  it("maps stored values and relation ids", () => {
    const s = mapSiteSettings({
      maxSeatsPerPurchase: 4,
      holdMinutes: 20,
      reminderOffsetsHours: [72],
      legal: { termsPage: { id: 7 }, privacyPage: 8 },
    })
    expect(s.maxSeatsPerPurchase).toBe(4)
    expect(s.reminderOffsetsHours).toEqual([72])
    expect(s.legal).toEqual({ termsPageId: 7, privacyPageId: 8, cancellationPageId: null })
  })
  it("does not share default arrays between calls", () => {
    mapSiteSettings(null).reminderOffsetsHours.push(1)
    expect(mapSiteSettings(null).reminderOffsetsHours).toEqual([48, 24])
  })
  it("sorts tiers desc and defaults self-cancel on", () => {
    const p = mapCancellationPolicy({
      tiers: [
        { minHoursBefore: 24, outcome: "credit", percent: 50 },
        { minHoursBefore: 72, outcome: "refund", percent: 100 },
      ],
    })
    expect(p.tiers.map((t) => t.minHoursBefore)).toEqual([72, 24])
    expect(p.customerCanSelfCancel).toBe(true)
    expect(mapCancellationPolicy(null)).toEqual({ tiers: [], customerCanSelfCancel: true })
  })
})

describe("buildSyncData", () => {
  it("touches only the four sync fields", () => {
    expect(buildSyncData({ status: "synced", productId: "p", priceId: "pr" })).toEqual({
      stripeSyncStatus: "synced",
      stripeProductId: "p",
      stripePriceId: "pr",
      stripeSyncError: null,
    })
    expect(buildSyncData({ status: "error", error: "boom" })).toEqual({
      stripeSyncStatus: "error",
      stripeSyncError: "boom",
    })
  })
})
