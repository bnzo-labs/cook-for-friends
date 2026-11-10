import { getTranslations } from "next-intl/server"

import { EmptyState, OrdersTable, PageHeader, requirePortalCustomer } from "@/components/portal"
import { loadOrders } from "@/components/portal/data"
import { assertLocale } from "@/i18n/locale"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "portal.receipts" })
  return { title: t("title"), robots: { index: false, follow: false } }
}

export default async function AccountReceiptsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale)
  const customer = await requirePortalCustomer(locale, "/account/receipts")
  const [t, orders] = await Promise.all([getTranslations({ locale, namespace: "portal.receipts" }), loadOrders(customer.id)])

  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      {orders.length > 0 ? (
        <OrdersTable orders={orders} locale={locale} />
      ) : (
        <EmptyState title={t("empty_title")} body={t("empty_body")} ctaLabel={t("empty_cta")} ctaHref="/courses" />
      )}
    </>
  )
}
