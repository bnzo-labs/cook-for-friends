"use server"

import { headers } from "next/headers"

import { redirect } from "@/i18n/navigation"
import type { ProfileActionState } from "@/components/portal/profile-state"
import { parseProfileForm } from "@/components/portal/profile-validation"
import { getCurrentCustomer, updateCustomerProfile } from "@/modules/identity"

/**
 * Profile save. Identity is re-proven from the cookie on every call (Next also
 * Origin-checks server actions). Email is never read from the form.
 */
export async function saveProfile(_prev: ProfileActionState, data: FormData): Promise<ProfileActionState> {
  const customer = await getCurrentCustomer(await headers())
  if (!customer) return { status: "error" }

  const parsed = parseProfileForm(data)
  if (!parsed.ok) return { status: "error", errors: parsed.errors }

  // CustomerView does not expose dietaryNotes yet (CCR in task file), so the form
  // cannot prefill it: blank means "keep", never "erase".
  const { dietaryNotes, ...rest } = parsed.value
  const result = await updateCustomerProfile(customer.id, dietaryNotes === null ? rest : { ...rest, dietaryNotes })
  if (!result.ok) return { status: "error", errors: result.error.code === "VALIDATION" ? { preferredLocale: { code: "invalid" } } : undefined }

  // Switch the page to the new language only when the stored preference changed.
  if (parsed.value.preferredLocale !== customer.preferredLocale) {
    redirect({ href: { pathname: "/account/profile", query: { saved: "1" } }, locale: parsed.value.preferredLocale })
  }
  return { status: "saved" }
}
