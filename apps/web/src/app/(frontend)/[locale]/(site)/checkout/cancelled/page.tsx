import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { assertLocale } from "@/i18n/locale"
import { Button } from "@/components/ui/button"
import { Section, Container } from "@/components/layout"
import { ReleaseOnMount } from "@/components/storefront/booking/ReleaseOnMount"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "storefront.booking" })
  return { title: t("cancelled_meta_title"), robots: { index: false, follow: false } }
}

export default async function CheckoutCancelledPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "storefront.booking" })
  return (
    <Section spacing="hero">
      <Container width="prose">
        <div className="flex flex-col items-start gap-5">
          <h1 className="font-display text-3xl font-semibold text-fg">{t("cancelled_heading")}</h1>
          <ReleaseOnMount />
          <Button asChild size="lg">
            <Link href="/courses">{t("cancelled_back")}</Link>
          </Button>
        </div>
      </Container>
    </Section>
  )
}
