import { z } from "zod"

import { locales } from "@/i18n/locales"
import type { ID, Locale, Result } from "@/modules/_shared"
import { getSessionView } from "@/modules/catalog"

import { getPayload } from "./payload"

export const joinWaitlistSchema = z.object({
  sessionId: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,9}$/)]),
  email: z.string().trim().email().max(254),
  locale: z.enum(locales),
})

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/**
 * CONTRACT §4 `joinWaitlist` (D10). Session must be `scheduled` and in the future.
 * A duplicate `(session, email)` is a silent success (no enumeration). Never creates a customer.
 */
export async function joinWaitlist(i: { sessionId: ID; email: string; locale: Locale }): Promise<Result<void>> {
  const parsed = joinWaitlistSchema.safeParse(i)
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", issues: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) } }
  }
  const { sessionId, locale } = parsed.data
  const email = normalizeEmail(parsed.data.email)

  const session = await getSessionView(sessionId, locale)
  if (!session) return { ok: false, error: { code: "NOT_FOUND", entity: "session" } }
  if (session.status !== "scheduled" || new Date(session.startsAt).getTime() <= Date.now()) {
    return { ok: false, error: { code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" } }
  }

  const payload = await getPayload()
  const exists = async () =>
    (
      await payload.count({
        collection: "waitlist-entries",
        where: { and: [{ session: { equals: sessionId } }, { email: { equals: email } }] },
        overrideAccess: true,
      })
    ).totalDocs > 0
  if (await exists()) return { ok: true, data: undefined }
  try {
    await payload.create({
      collection: "waitlist-entries",
      data: { session: Number(sessionId), email, locale, status: "waiting" },
      overrideAccess: true,
    })
  } catch (error) {
    // Lost a race on UNIQUE (session, email): same outcome as a duplicate.
    if (await exists()) return { ok: true, data: undefined }
    throw error
  }
  return { ok: true, data: undefined }
}
