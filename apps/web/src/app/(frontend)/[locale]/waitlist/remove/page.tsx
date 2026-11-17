import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"

import { Container, Section } from "@/components/layout"
import { WaitlistRemoveForm } from "@/components/storefront/waitlist/WaitlistRemoveForm"
import { assertLocale } from "@/i18n/locale"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "storefront.waitlist.remove" })
  // The URL carries the token: never index, never leak it through Referer.
  return { title: t("meta_title"), robots: { index: false, follow: false }, referrer: "no-referrer" }
}

/** GET only renders the confirm button: no DB call, no state change (mail scanners prefetch links). */
export default async function WaitlistRemovePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const locale = assertLocale((await params).locale)
  const [t, sp] = await Promise.all([getTranslations({ locale, namespace: "storefront.waitlist.remove" }), searchParams])
  const token = typeof sp.token === "string" && sp.token.length > 0 ? sp.token : null

  return (
    <Section spacing="default" aria-labelledby="waitlist-remove-heading">
      <Container width="prose" className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 id="waitlist-remove-heading" className="font-display text-(length:--text-2xl) font-semibold leading-(--leading-tight) text-fg">
            {t("title")}
          </h1>
          <p className="text-fg-muted">{t("intro")}</p>
        </header>
        <WaitlistRemoveForm token={token} />
      </Container>
    </Section>
  )
}
