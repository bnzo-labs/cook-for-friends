import { getTranslations } from "next-intl/server"

import { LoginForm } from "@/components/portal"
import { Container, Section } from "@/components/layout"
import { assertLocale } from "@/i18n/locale"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "auth.login" })
  return { title: t("meta_title"), robots: { index: false, follow: false } }
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const locale = assertLocale((await params).locale)
  const [t, sp] = await Promise.all([getTranslations({ locale, namespace: "auth.login" }), searchParams])
  const next = typeof sp.next === "string" ? sp.next : undefined

  return (
    <Section spacing="default" aria-labelledby="login-heading">
      <Container width="prose" className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 id="login-heading" className="font-display text-(length:--text-2xl) font-semibold leading-(--leading-tight) text-fg">
            {t("title")}
          </h1>
          <p className="text-fg-muted">{t("intro")}</p>
        </header>
        <LoginForm locale={locale} next={next} />
      </Container>
    </Section>
  )
}
