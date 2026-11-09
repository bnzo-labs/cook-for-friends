import { getTranslations } from "next-intl/server"

import { AccountNav } from "@/components/portal"
import { Container } from "@/components/layout"
import { assertLocale } from "@/i18n/locale"
import { getCurrentCustomer } from "@/modules/identity"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

/**
 * Portal chrome. Auth is enforced per page by `requirePortalCustomer`, because a
 * layout cannot know its own pathname and the redirect must carry `next`. Layout
 * and page render in parallel; here a signed-out visitor just gets no menu
 * while the page issues the redirect.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const locale = assertLocale((await params).locale)
  const customer = await getCurrentCustomer(await headers())
  if (!customer) return <>{children}</>
  const t = await getTranslations({ locale, namespace: "portal.nav" })

  return (
    <Container className="py-8 lg:py-12">
      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 truncate text-sm text-fg-muted" data-account-email>
            {customer.email}
          </p>
          <AccountNav
            label={t("label")}
            coursesLabel={t("courses")}
            logoutLabel={t("logout")}
            items={[
              { href: "/account", label: t("dashboard") },
              { href: "/account/sessions", label: t("sessions") },
              { href: "/account/history", label: t("history") },
              { href: "/account/receipts", label: t("receipts") },
              { href: "/account/profile", label: t("profile") },
            ]}
          />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  )
}
