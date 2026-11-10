import { getTranslations } from "next-intl/server"

import { VerifyForm } from "@/components/portal"
import { Container, Section } from "@/components/layout"
import { assertLocale } from "@/i18n/locale"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "auth.verify" })
  // The URL carries the token: never index, never leak it through Referer.
  return { title: t("meta_title"), robots: { index: false, follow: false }, referrer: "no-referrer" }
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const locale = assertLocale((await params).locale)
  const [t, sp] = await Promise.all([getTranslations({ locale, namespace: "auth.verify" }), searchParams])
  const token = typeof sp.token === "string" && sp.token.length > 0 ? sp.token : null

  return (
    <Section spacing="default" aria-labelledby="verify-heading">
      <Container width="prose" className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 id="verify-heading" className="font-display text-(length:--text-2xl) font-semibold leading-(--leading-tight) text-fg">
            {t("title")}
          </h1>
          <p className="text-fg-muted">{t("intro")}</p>
        </header>
        <VerifyForm token={token} />
      </Container>
    </Section>
  )
}
