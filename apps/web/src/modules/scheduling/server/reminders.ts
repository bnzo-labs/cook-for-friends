import type { Locale } from "@/modules/_shared"
import { getSessionView, getSiteSettings, listSessionsStartingBetween, type SessionView } from "@/modules/catalog"
import { listAttendees, type AttendeeRow } from "@/modules/commerce"
import { enqueueEmail } from "@/modules/notifications"

import { emailLocation, sessionIcs } from "./email-data"
import { getPayload } from "./payload"
import { pickReminderOffset } from "./reminder-offsets"
import { withTransaction } from "./tx"
import { loginUrl } from "./urls"

const DEFAULT_OFFSETS = [48, 24]
const HOUR = 3_600_000

const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / HOUR

/** Sessions that already started can no longer be joined: close their open waitlist entries. */
async function expireStartedWaitlists(now: Date): Promise<void> {
  const payload = await getPayload()
  await payload.update({
    collection: "waitlist-entries",
    where: {
      and: [{ status: { in: ["waiting", "notified"] } }, { "session.startsAt": { less_than: now.toISOString() } }],
    },
    data: { status: "expired" },
    overrideAccess: true,
  })
}

async function alreadyDelivered(enrollmentIds: number[]): Promise<Set<string>> {
  if (enrollmentIds.length === 0) return new Set()
  const payload = await getPayload()
  const res = await payload.find({
    collection: "reminder-deliveries",
    where: { enrollment: { in: enrollmentIds } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return new Set(res.docs.map((d) => `${typeof d.enrollment === "object" ? d.enrollment.id : d.enrollment}:${d.offsetHours}`))
}

async function deliveryExists(enrollmentId: number, offsetHours: number): Promise<boolean> {
  const payload = await getPayload()
  const res = await payload.count({
    collection: "reminder-deliveries",
    where: { and: [{ enrollment: { equals: enrollmentId } }, { offsetHours: { equals: offsetHours } }] },
    overrideAccess: true,
  })
  return res.totalDocs > 0
}

type Ctx = { contactEmail: string | null; viewFor: (locale: Locale) => Promise<SessionView> }

/**
 * Insert the ledger row and enqueue the email in ONE transaction. UNIQUE (enrollment, offset)
 * makes a concurrent run block, then fail on commit-visible duplicate → rollback → skip.
 */
async function deliver(row: AttendeeRow, offset: number, ctx: Ctx): Promise<boolean> {
  const enrollmentId = Number(row.enrollmentId)
  const view = await ctx.viewFor(row.locale)
  const [accountUrl, ics] = await Promise.all([loginUrl(row.locale), sessionIcs(view, row.locale)])
  try {
    await withTransaction(async ({ tx }) => {
      const payload = tx.req.payload
      await payload.create({
        collection: "reminder-deliveries",
        data: { enrollment: enrollmentId, offsetHours: offset, sentAt: new Date().toISOString() },
        overrideAccess: true,
        req: tx.req,
      })
      await enqueueEmail({
        template: "reminder",
        to: row.email,
        locale: row.locale,
        idempotencyKey: `reminder-${enrollmentId}-${offset}`,
        data: {
          ...(row.firstName ? { attendeeFirstName: row.firstName } : {}),
          courseTitle: view.courseTitle,
          sessionStartsAt: view.startsAt,
          sessionEndsAt: view.endsAt,
          location: emailLocation(view),
          hoursBefore: offset,
          accountUrl,
          ...(ctx.contactEmail ? { contactEmail: ctx.contactEmail } : {}),
        },
        ics,
        tx,
      })
    })
    return true
  } catch (error) {
    if (await deliveryExists(enrollmentId, offset)) return false // another run won the race
    console.error("[scheduling] reminder failed", { enrollmentId, offset, error })
    return false
  }
}

/**
 * CONTRACT §4 `sendDueReminders` (CCR-W3-5). Hourly cron. For each confirmed attendee (buyer
 * and guests, Q6) of a scheduled session in the next `max(offsets)` h: send the reminder of the
 * current window once; exactly-once across overlapping runs via `reminder-deliveries`.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const settings = await getSiteSettings()
  const offsets = settings.reminderOffsetsHours.length > 0 ? settings.reminderOffsetsHours : DEFAULT_OFFSETS

  try {
    await expireStartedWaitlists(now)
  } catch (error) {
    console.error("[scheduling] waitlist expiry sweep failed", error)
  }

  const maxOffset = Math.max(...offsets)
  const sessions = await listSessionsStartingBetween(now, new Date(now.getTime() + maxOffset * HOUR + 1))
  let sent = 0
  for (const session of sessions) {
    try {
      sent += await remindSession(session, offsets, now, settings.contactEmail)
    } catch (error) {
      console.error("[scheduling] session reminders failed", { sessionId: session.id, error })
    }
  }
  return { sent }
}

async function remindSession(session: SessionView, offsets: number[], now: Date, contactEmail: string | null): Promise<number> {
  const startsAt = new Date(session.startsAt)
  const hoursUntil = hoursBetween(now, startsAt)
  const rows = (await listAttendees(session.id)).filter((r) => r.enrollmentStatus === "confirmed" && r.email)

  const due = rows.flatMap((row) => {
    const paid = new Date(row.paidAt)
    const booked = Number.isNaN(paid.getTime()) ? Number.POSITIVE_INFINITY : hoursBetween(paid, startsAt)
    const offset = pickReminderOffset(offsets, hoursUntil, booked)
    return offset === null ? [] : [{ row, offset }]
  })
  if (due.length === 0) return 0

  const delivered = await alreadyDelivered(due.map((d) => Number(d.row.enrollmentId)))
  const views = new Map<Locale, SessionView>([["fr", session]])
  const ctx: Ctx = {
    contactEmail,
    viewFor: async (locale) => {
      if (!views.has(locale)) views.set(locale, (await getSessionView(session.id, locale)) ?? session)
      return views.get(locale) ?? session
    },
  }
  let sent = 0
  for (const { row, offset } of due) {
    if (delivered.has(`${row.enrollmentId}:${offset}`)) continue
    if (await deliver(row, offset, ctx)) sent += 1
  }
  return sent
}
