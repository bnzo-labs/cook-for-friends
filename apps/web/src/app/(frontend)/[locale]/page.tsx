import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"
import { Container, Section } from "@/components/layout"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "common" })

  return {
    title: t("site_name"),
    description: t("tagline"),
  }
}

/**
 * Placeholder home page.
 * W2-05 (storefront) will replace this with the full landing page.
 * The surrounding <main> landmark lives in the locale layout.
 */
export default function HomePage() {
  const t = useTranslations("common")

  return (
    <Section spacing="hero" aria-labelledby="home-heading">
      <Container>
        <h1 id="home-heading" className="max-w-[16ch] text-hero font-semibold">
          {t("site_name")}
        </h1>
        <p className="mt-6 max-w-[45ch] text-lg text-fg-muted">{t("tagline")}</p>
      </Container>
    </Section>
  )
}
