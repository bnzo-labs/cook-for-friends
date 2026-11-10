import { sql } from "@payloadcms/db-postgres/drizzle"

import type { ID, Locale } from "@/modules/_shared"
import { getSessionView, getSiteSettings, type SessionView } from "@/modules/catalog"
import { getAvailableSeats, listAttendees } from "@/modules/commerce"
import { enqueueEmail } from "@/modules/notifications"

import { emailLocation } from "./email-data"
import { getPayload } from "./payload"
import { withTransaction } from "./tx"
import { courseUrl } from "./urls"

const PAGE = 50

type Entry = { id: number; email: string; locale: Locale }

async function waitingPage(sessionId: ID, page: number): Promise<{ entries: Entry[]; hasNext: boolean }> {
  const payload = await getPayload()
  const res = await payload.find({
    collection: "waitlist-entries",
    where: { and: [{ session: { equals: sessionId } }, { status: { equals: "waiting" } }] },
    sort: ["createdAt", "id"],
    limit: PAGE,
    page,
    depth: 0,
    overrideAccess: true,
  })
  return {
    entries: res.docs.map((d) => ({ id: d.id, email: d.email.toLowerCase(), locale: d.locale === "en" ? "en" : "fr" })),
    hasNext: res.hasNextPage,
  }
}

/** Already holds a confirmed seat → the entry is done, never emailed. Conditional: only the winner of the race acts. */
async function markConverted(id: number): Promise<void> {
  await withTransaction(async ({ db }) => {
    await db.execute(sql`UPDATE waitlist_entries SET status = 'converted', updated_at = now() WHERE id = ${id} AND status = 'waiting'`)
  })
}

/**
 * Claim `waiting → notified` and enqueue the email in one transaction. The conditional UPDATE
 * is the lock: of two concurrent callers only one gets a row back and sends (D10, Q16).
 */
async function claimAndNotify(entry: Entry, view: SessionView): Promise<boolean> {
  const bookUrl = await courseUrl(entry.locale, view.courseSlug)
  return withTransaction(async ({ db, tx }) => {
    const { rows } = await db.execute(
      sql`UPDATE waitlist_entries SET status = 'notified', notified_at = now(), updated_at = now()
          WHERE id = ${entry.id} AND status = 'waiting' RETURNING id`,
    )
    if (rows.length === 0) return false
    await enqueueEmail({
      template: "waitlist-seat-available",
      to: entry.email,
      locale: entry.locale,
      idempotencyKey: `waitlist-${entry.id}`,
      data: { courseTitle: view.courseTitle, sessionStartsAt: view.startsAt, location: emailLocation(view), bookUrl },
      tx,
    })
    return true
  })
}

async function notifyWaitlist(sessionId: ID): Promise<void> {
  const settings = await getSiteSettings()
  const quota = Math.max(0, Math.floor(settings.waitlistNotifyCount))
  if (quota === 0) return
  if ((await getAvailableSeats(sessionId)) <= 0) return

  const base = await getSessionView(sessionId, "fr")
  if (!base || base.status !== "scheduled" || new Date(base.startsAt).getTime() <= Date.now()) return

  const holders = new Set(
    (await listAttendees(sessionId)).filter((a) => a.enrollmentStatus === "confirmed").map((a) => a.email.trim().toLowerCase()),
  )
  const views = new Map<Locale, SessionView | null>([["fr", base]])
  const viewFor = async (locale: Locale) => {
    if (!views.has(locale)) views.set(locale, await getSessionView(sessionId, locale))
    return views.get(locale) ?? base
  }

  let notified = 0
  for (let page = 1; notified < quota; page += 1) {
    const { entries, hasNext } = await waitingPage(sessionId, page)
    for (const entry of entries) {
      if (notified >= quota) break
      if (holders.has(entry.email)) {
        await markConverted(entry.id)
        continue
      }
      if (await claimAndNotify(entry, await viewFor(entry.locale))) notified += 1
    }
    if (!hasNext) break
  }
}

/**
 * Called by commerce (webhook, expired holds) and by cancellation when a seat frees up.
 * D10: if seats are available, notify the next `waitlistNotifyCount` `waiting` entries FIFO,
 * each at most once; first to pay wins. Never throws.
 */
export async function onSeatReleased(sessionId: ID): Promise<void> {
  try {
    await notifyWaitlist(sessionId)
  } catch (error) {
    console.error("[scheduling] onSeatReleased failed", { sessionId, error })
  }
}
