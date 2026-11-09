import { headers } from "next/headers"

import { getPathname, redirect } from "@/i18n/navigation"
import { getCurrentCustomer, type CustomerView } from "@/modules/identity"
import type { Locale } from "@/modules/_shared"

export type PortalHref =
  | "/account"
  | "/account/sessions"
  | "/account/history"
  | "/account/receipts"
  | "/account/profile"

/**
 * Portal guard (server). Signed out → localized login with `next` set to the
 * current localized path. `identity.requireCustomer` redirects to the untranslated
 * `/{locale}/auth/login`, which does not exist for FR, so the portal builds the
 * localized URL itself. Every portal page calls this before any data call.
 */
export async function requirePortalCustomer(locale: Locale, href: PortalHref): Promise<CustomerView> {
  const customer = await getCurrentCustomer(await headers())
  if (!customer) {
    redirect({ href: { pathname: "/auth/login", query: { next: getPathname({ locale, href }) } }, locale })
    throw new Error("unreachable: redirect() throws")
  }
  return customer
}
