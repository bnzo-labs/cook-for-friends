import { z } from "zod"

import { locales } from "@/i18n/locales"
import type { ID, Result } from "@/modules/_shared"
import type { CustomerView } from "../types"
import { getPayload } from "./payload"
import { toCustomerView } from "./magic-link"

/** Blank strings clear the field (`null`); the portal form submits "" for empty inputs. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim()))

/**
 * Editable profile fields only. `.strict()` rejects everything else (email,
 * stripeCustomerId, sessionVersion…) as VALIDATION instead of ignoring it.
 */
export const profilePatchSchema = z
  .object({
    firstName: z.string().trim().max(100),
    lastName: z.string().trim().max(100),
    phone: optionalText(30),
    preferredLocale: z.enum(locales),
    marketingConsent: z.boolean(),
    dietaryNotes: optionalText(500),
  })
  .partial()
  .strict()

export type ProfilePatch = z.input<typeof profilePatchSchema>

/**
 * Update the customer's own profile (CCR-W3-2). Writes only the supplied keys;
 * `email` is immutable and `sessionVersion` is never touched (no logout).
 * The caller (route) proves identity; this validates and persists.
 */
export async function updateCustomerProfile(
  customerId: ID,
  patch: ProfilePatch,
): Promise<Result<CustomerView>> {
  const parsed = profilePatchSchema.safeParse(patch)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.length > 0 ? i.path.join(".") : (i.code === "unrecognized_keys" ? i.keys.join(",") : ""),
          message: i.message,
        })),
      },
    }
  }
  const payload = await getPayload()
  const existing = await payload.find({
    collection: "customers",
    where: { id: { equals: customerId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (!existing.docs[0]) return { ok: false, error: { code: "NOT_FOUND", entity: "customer" } }
  if (Object.keys(parsed.data).length === 0) return { ok: true, data: toCustomerView(existing.docs[0]) }

  const updated = await payload.update({
    collection: "customers",
    id: customerId,
    data: parsed.data,
    depth: 0,
    overrideAccess: true,
  })
  return { ok: true, data: toCustomerView(updated) }
}
