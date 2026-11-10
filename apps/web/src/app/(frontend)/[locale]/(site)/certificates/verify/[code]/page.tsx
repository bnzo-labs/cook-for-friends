import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"

import { Container, Section } from "@/components/layout"
import { VerifyResult } from "@/components/storefront/certificate/VerifyResult"
import { assertLocale } from "@/i18n/locale"
import { verifyCertificate } from "@/modules/learning"

// Public, per-code, never cached: a certificate is checked live.
export const dynamic = "force-dynamic"

type Params = { locale: string; code: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const [t, tc] = await Promise.all([
    getTranslations({ locale, namespace: "storefront.certificate" }),
    getTranslations({ locale, namespace: "common" }),
  ])
  return { title: `${t("meta_title")} — ${tc("site_name")}`, robots: { index: false, follow: false } }
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default async function VerifyCertificatePage({ params }: { params: Promise<Params> }) {
  const { locale: rawLocale, code } = await params
  const locale = assertLocale(rawLocale)
  const [t, certificate] = await Promise.all([
    getTranslations({ locale, namespace: "storefront.certificate" }),
    verifyCertificate(safeDecode(code)),
  ])

  return (
    <Section aria-labelledby="verify-heading">
      <Container className="flex max-w-3xl flex-col gap-8">
        <h1 id="verify-heading" className="font-display text-(length:--text-2xl) font-semibold leading-(--leading-tight) text-fg">
          {t("heading")}
        </h1>
        <VerifyResult locale={locale} certificate={certificate} />
      </Container>
    </Section>
  )
}
