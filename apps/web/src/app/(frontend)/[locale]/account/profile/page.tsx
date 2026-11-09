import { getTranslations } from "next-intl/server"

import { PageHeader, ProfileForm, requirePortalCustomer } from "@/components/portal"
import { assertLocale } from "@/i18n/locale"
import type { Metadata } from "next"

import { saveProfile } from "./actions"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "portal.profile" })
  return { title: t("title"), robots: { index: false, follow: false } }
}

export default async function AccountProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const locale = assertLocale((await params).locale)
  const customer = await requirePortalCustomer(locale, "/account/profile")
  const [t, sp] = await Promise.all([getTranslations({ locale, namespace: "portal.profile" }), searchParams])

  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <ProfileForm
        savedFlash={sp.saved === "1"}
        action={saveProfile}
        values={{
          email: customer.email,
          firstName: customer.firstName ?? "",
          lastName: customer.lastName ?? "",
          phone: customer.phone ?? "",
          dietaryNotes: "",
          preferredLocale: customer.preferredLocale,
          marketingConsent: customer.marketingConsent,
        }}
      />
    </>
  )
}
