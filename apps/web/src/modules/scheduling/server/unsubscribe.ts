import type { Result } from "@/modules/_shared"

import { getPayload } from "./payload"
import { verifyWaitlistRemoveToken } from "./unsubscribe-token"

/**
 * W4-08: remove a waitlist entry from a signed link token. Idempotent: a missing entry is still success.
 * Bad / expired token → VALIDATION (generic, nothing about why).
 */
export async function removeWaitlistEntryByToken(token: unknown, now: Date = new Date()): Promise<Result<void>> {
  const id = verifyWaitlistRemoveToken(token, now)
  if (id === null) return { ok: false, error: { code: "VALIDATION", issues: [{ path: "token", message: "INVALID_TOKEN" }] } }
  const payload = await getPayload()
  await payload.delete({ collection: "waitlist-entries", where: { id: { equals: id } }, overrideAccess: true })
  return { ok: true, data: undefined }
}
