import { getTranslations } from "next-intl/server"

import { EmptyState, PageHeader, SeatList, requirePortalCustomer } from "@/components/portal"
import { loadSeats } from "@/components/portal/data"
import { loadCancelContext } from "@/components/portal/sessions/cancel-data"
import { assertLocale } from "@/i18n/locale"
import { Link } from "@/i18n/navigation"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "portal.sessions" })
  return { title: t("title"), robots: { index: false, follow: false } }
}

export default async function AccountSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale)
  const customer = await requirePortalCustomer(locale, "/account/sessions")
  const [t, seats] = await Promise.all([getTranslations({ locale, namespace: "portal.sessions" }), loadSeats(customer.id, locale)])

  const cancel = await loadCancelContext(customer.id, locale, seats.upcoming)

  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      {seats.upcoming.length > 0 ? (
        <div className="flex flex-col gap-6">
          <SeatList seats={seats.upcoming} locale={locale} label={t("title")} cancel={cancel} />
          <Link href="/account/history" className="self-start rounded-sm text-sm font-medium text-primary underline underline-offset-4">
            {t("see_history")}
          </Link>
        </div>
      ) : (
        <EmptyState title={t("empty_title")} body={t("empty_body")} ctaLabel={t("empty_cta")} ctaHref="/courses" />
      )}
    </>
  )
}
