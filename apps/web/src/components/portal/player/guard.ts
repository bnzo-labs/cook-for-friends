import { headers } from "next/headers"

import { getPathname, redirect } from "@/i18n/navigation"
import { getCurrentCustomer, type CustomerView } from "@/modules/identity"
import type { Locale } from "@/modules/_shared"

export type PlayerHref =
  | { pathname: "/account/courses/[slug]"; params: { slug: string } }
  | { pathname: "/account/courses/[slug]/[lesson]"; params: { slug: string; lesson: string } }

/**
 * Player guard (server). Same contract as `requirePortalCustomer`, for the
 * parameterized player routes: signed out → localized login with `next` set to
 * the current localized path. Call before any data call.
 */
export async function requirePlayerCustomer(locale: Locale, href: PlayerHref): Promise<CustomerView> {
  const customer = await getCurrentCustomer(await headers())
  if (!customer) {
    redirect({ href: { pathname: "/auth/login", query: { next: getPathname({ locale, href }) } }, locale })
    throw new Error("unreachable: redirect() throws")
  }
  return customer
}
