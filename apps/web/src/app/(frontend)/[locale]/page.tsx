import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"
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
 */
export default function HomePage() {
  const t = useTranslations("common")

  return (
    <main>
      <h1>{t("site_name")}</h1>
      <p>{t("tagline")}</p>
    </main>
  )
}
