import { listActiveEntitlements } from "@/modules/access"
import { getSessionView, listCoursesByIds, getSiteSettings, type CourseCard } from "@/modules/catalog"
import { listCustomerEnrollments, listCustomerOrders, type EnrollmentView, type OrderSummary } from "@/modules/commerce"
import type { ID, Locale } from "@/modules/_shared"

import { safeExternalUrl } from "./format"

/** One seat row, ready to render. No PII beyond what the page shows. */
export type SeatRow = {
  enrollmentId: ID
  orderNumber: string
  courseTitle: string
  startsAt: string
  endsAt: string
  locationName: string | null
  status: EnrollmentView["status"]
  attendance: EnrollmentView["attendance"]
  /** Seat held by a guest whom the viewer booked (not the viewer's own seat). */
  isGuestSeat: boolean
  guestName: string | null
  bookedByMe: boolean
  upcoming: boolean
}

export type SeatGroups = { upcoming: SeatRow[]; past: SeatRow[] }

/** Online courses the customer currently owns (active entitlements only). In-person entitlements show as sessions. */
export async function loadOwnedCourses(customerId: ID, locale: Locale): Promise<CourseCard[]> {
  const entitlements = await listActiveEntitlements(customerId)
  const ids = [...new Set(entitlements.filter((e) => e.revokedAt === null).map((e) => String(e.courseId)))]
  if (ids.length === 0) return []
  const cards = await listCoursesByIds(ids, locale)
  return cards.filter((c) => c.format === "online")
}

/** Seats the customer occupies or booked, split upcoming (ascending) / past (newest first). */
export async function loadSeats(customerId: ID, locale: Locale, now: Date = new Date()): Promise<SeatGroups> {
  const enrollments = await listCustomerEnrollments(customerId)
  const sessionIds = [...new Set(enrollments.map((e) => String(e.sessionId)))]
  const views = await Promise.all(sessionIds.map((id) => getSessionView(id, locale)))
  const bySession = new Map(views.flatMap((v) => (v ? [[String(v.id), v] as const] : [])))

  const rows: SeatRow[] = []
  for (const e of enrollments) {
    const session = bySession.get(String(e.sessionId))
    if (!session) continue
    rows.push({
      enrollmentId: e.id,
      orderNumber: e.orderNumber,
      courseTitle: session.courseTitle,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      locationName: session.location.name ?? session.location.city ?? null,
      status: e.status,
      attendance: e.attendance,
      isGuestSeat: !e.isOwnSeat && e.bookedByMe,
      guestName: e.attendeeName?.trim() || null,
      bookedByMe: e.bookedByMe,
      upcoming: new Date(session.endsAt) > now,
    })
  }
  const time = (r: SeatRow) => new Date(r.startsAt).getTime()
  return {
    upcoming: rows.filter((r) => r.upcoming).sort((a, b) => time(a) - time(b)),
    past: rows.filter((r) => !r.upcoming).sort((a, b) => time(b) - time(a)),
  }
}

/** Buyer's orders, newest first (commerce already sorts; kept stable here). */
export async function loadOrders(customerId: ID): Promise<OrderSummary[]> {
  return listCustomerOrders(customerId)
}

/** Community link, or null while unset/invalid (D3: no dead link). */
export async function loadCommunityUrl(): Promise<string | null> {
  const settings = await getSiteSettings()
  return safeExternalUrl(settings.communityUrl)
}
