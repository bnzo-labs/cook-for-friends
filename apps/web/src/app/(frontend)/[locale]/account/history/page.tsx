import { getTranslations } from "next-intl/server"

import { EmptyState, PageHeader, SeatList, requirePortalCustomer } from "@/components/portal"
import { loadSeats } from "@/components/portal/data"
import { assertLocale } from "@/i18n/locale"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "portal.history" })
  return { title: t("title"), robots: { index: false, follow: false } }
}

export default async function AccountHistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale)
  const customer = await requirePortalCustomer(locale, "/account/history")
  const [t, seats] = await Promise.all([getTranslations({ locale, namespace: "portal.history" }), loadSeats(customer.id, locale)])

  return (
    <div className="flex flex-col gap-12">
      <div>
        <PageHeader title={t("title")} intro={t("intro")} />
        {seats.past.length > 0 ? (
          <SeatList seats={seats.past} locale={locale} label={t("past_sessions")} />
        ) : (
          <EmptyState title={t("empty_title")} body={t("empty_body")} ctaLabel={t("empty_cta")} ctaHref="/courses" />
        )}
      </div>
      {/* Mount point for certificates (W3-01b fills this section). */}
      <section id="certificates" aria-label={t("certificates_label")} data-certificates-slot className="scroll-mt-6" />
    </div>
  )
}
