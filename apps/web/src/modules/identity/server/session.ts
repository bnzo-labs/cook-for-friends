import { redirect } from "next/navigation"
import { generateExpiredPayloadCookie } from "payload/shared"

import { defaultLocale, locales } from "@/i18n/locales"
import { getPayload } from "./payload"
import type { Locale } from "@/modules/_shared"
import type { CustomerView } from "../types"
import { toCustomerView } from "./magic-link"

/** The signed-in customer for these request headers, or null (anonymous, staff, expired). */
export async function getCurrentCustomer(headers: Headers): Promise<CustomerView | null> {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers })
  if (!user || user.collection !== "customers") return null
  return toCustomerView(user as Parameters<typeof toCustomerView>[0])
}

function localeFromHeaders(headers: Headers): Locale {
  const candidate = headers.get("x-next-intl-locale")
  return (locales as readonly string[]).includes(candidate ?? "") ? (candidate as Locale) : defaultLocale
}

/** Portal guard. Throws Next's redirect error to `/{locale}/auth/login`. */
export async function requireCustomer(headers: Headers): Promise<CustomerView> {
  const customer = await getCurrentCustomer(headers)
  if (!customer) redirect(`/${localeFromHeaders(headers)}/auth/login`)
  return customer
}

/**
 * Identify the signed-in customer (for the redirect locale) and return the
 * cookie that clears the session. Staff cookies are left alone.
 *
 * Logout also increments `sessionVersion`, revoking every cookie of this
 * customer (all devices). The strategy rejects tokens with a stale version.
 */
export async function endCustomerSession(
  headers: Headers,
): Promise<{ customer: CustomerView | null; clearCookie: string | null }> {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers })
  if (user && user.collection !== "customers") return { customer: null, clearCookie: null }

  const collectionConfig = payload.collections["customers"].config
  const clearCookie = generateExpiredPayloadCookie({
    collectionAuthConfig: collectionConfig.auth,
    cookiePrefix: payload.config.cookiePrefix,
  })
  if (user) {
    const current = (user as { sessionVersion?: number | null }).sessionVersion ?? 0
    await payload.update({
      collection: "customers",
      id: user.id,
      data: { sessionVersion: current + 1 },
      overrideAccess: true,
      depth: 0,
    })
  }
  const customer = user ? toCustomerView(user as Parameters<typeof toCustomerView>[0]) : null
  return { customer, clearCookie }
}
