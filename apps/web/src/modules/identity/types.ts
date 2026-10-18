import type { ID, Locale } from "@/modules/_shared"

/** Customer as exposed to other modules and the portal (CONTRACT §4). */
export type CustomerView = {
  id: ID
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  preferredLocale: Locale
  stripeCustomerId: string | null
  marketingConsent: boolean
}
