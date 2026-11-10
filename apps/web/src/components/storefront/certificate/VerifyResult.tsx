import { getTranslations } from "next-intl/server"
import { SealCheck, SealQuestion } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"
import { formatSessionDate } from "@/lib/storefront/format"
import { Link } from "@/i18n/navigation"
import type { Locale } from "@/modules/_shared"
import type { CertificatePublicView } from "@/modules/learning"

/**
 * Public certificate lookup result. A miss is a calm 200 page (same status as a
 * hit, so the response code is no oracle).
 */
export async function VerifyResult({ locale, certificate }: { locale: Locale; certificate: CertificatePublicView | null }) {
  const t = await getTranslations({ locale, namespace: "storefront.certificate" })

  if (!certificate) {
    return (
      <div
        role="status"
        data-certificate-result="invalid"
        className="flex flex-col items-start gap-4 rounded-card border border-dashed border-border bg-surface p-8"
      >
        <SealQuestion aria-hidden="true" size={40} className="text-fg-muted" />
        <h2 className="font-display text-xl font-semibold text-fg">{t("invalid_title")}</h2>
        <p className="max-w-prose text-fg-muted">{t("invalid_body")}</p>
        <Button asChild variant="secondary">
          <Link href="/courses">{t("see_courses")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <section
      aria-labelledby="certificate-valid-heading"
      data-certificate-result="valid"
      className="flex flex-col gap-6 rounded-card border border-border bg-surface p-8 shadow-card"
    >
      <div className="flex items-center gap-3">
        <SealCheck aria-hidden="true" size={40} weight="duotone" className="text-primary" />
        <div>
          <h2 id="certificate-valid-heading" className="font-display text-xl font-semibold text-fg">
            {t("valid_title")}
          </h2>
          <p className="text-fg-muted">{t("valid_body")}</p>
        </div>
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-fg-muted">{t("awarded_to")}</dt>
          <dd className="font-display text-lg font-semibold text-fg" data-certificate-name>
            {certificate.customerName}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">{t("course")}</dt>
          <dd className="font-display text-lg font-semibold text-fg" data-certificate-course>
            {certificate.courseTitle[locale]}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">{t("issued_on")}</dt>
          <dd className="text-fg">{formatSessionDate(certificate.issuedAt, locale)}</dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">{t("code")}</dt>
          <dd className="font-mono text-fg">{certificate.code}</dd>
        </div>
      </dl>
    </section>
  )
}
