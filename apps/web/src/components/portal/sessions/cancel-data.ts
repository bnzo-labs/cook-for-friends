import { getPayload } from "@/lib/payload"
import { getSiteSettings } from "@/modules/catalog"
import { previewCancellation } from "@/modules/scheduling"
import type { ID, Locale } from "@/modules/_shared"

import type { SeatRow } from "../data"
import type { CancelContext, CancelInfo } from "./types"

/** Seats that get a cancel slot: upcoming and confirmed (same rule as SeatCard). */
const needsCancel = (s: SeatRow) => s.upcoming && s.status === "confirmed"

/** First name only (never email or surname) of the buyer, for the guest "contact X" hint. */
async function buyerFirstNames(ids: ID[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.map(String))]
  if (unique.length === 0) return new Map()
  const payload = await getPayload()
  const entries = await Promise.all(
    unique.map(async (id) => {
      const c = await payload
        .findByID({ collection: "customers", id: Number(id), depth: 0, overrideAccess: true, select: { firstName: true } })
        .catch(() => null)
      return [id, c?.firstName?.trim() || null] as const
    }),
  )
  return new Map(entries)
}

/** Published cancellation policy page URL in the current locale, else null (no dead link). */
async function policyHref(pageId: ID | null, locale: Locale): Promise<string | null> {
  if (pageId === null) return null
  const payload = await getPayload()
  const page = await payload
    .findByID({ collection: "pages", id: Number(pageId), locale, fallbackLocale: "fr", depth: 0, overrideAccess: true, select: { slug: true, _status: true } })
    .catch(() => null)
  if (!page || page._status !== "published" || !page.slug) return null
  return `/${locale}/${page.slug}`
}

/**
 * Cancel slot data for upcoming confirmed seats. Outcome, amount and percent
 * come from `scheduling.previewCancellation` (the same policy `cancelEnrollment` applies).
 */
export async function loadCancelContext(customerId: ID, locale: Locale, seats: SeatRow[]): Promise<CancelContext> {
  const rows = seats.filter(needsCancel)
  const [settings, names, previews] = await Promise.all([
    getSiteSettings(),
    buyerFirstNames(rows.filter((s) => !s.bookedByMe).map((s) => s.buyerCustomerId)),
    Promise.all(rows.map((s) => previewCancellation({ enrollmentId: s.enrollmentId, actorCustomerId: customerId }))),
  ])
  const byEnrollment: Record<string, CancelInfo> = {}
  rows.forEach((seat, i) => {
    const r = previews[i]
    const key = String(seat.enrollmentId)
    if (!r || !r.ok) {
      byEnrollment[key] = { kind: "blocked", reason: "NOT_CONFIRMED", buyerFirstName: null }
      return
    }
    const p = r.data
    byEnrollment[key] = p.allowed
      ? { kind: "allowed", preview: { outcome: p.outcome, amount: p.amount, percent: p.percent, hoursBefore: p.hoursBefore, deadlineNextTier: p.deadlineNextTier ?? null } }
      : { kind: "blocked", reason: p.reason ?? "NOT_CONFIRMED", buyerFirstName: names.get(String(seat.buyerCustomerId)) ?? null }
  })
  return { byEnrollment, contactEmail: settings.contactEmail, policyHref: await policyHref(settings.legal.cancellationPageId, locale) }
}
