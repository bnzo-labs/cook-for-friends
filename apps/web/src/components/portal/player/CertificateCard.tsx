import { Certificate } from "@phosphor-icons/react/dist/ssr"
import { getTranslations } from "next-intl/server"

import { Button } from "@/components/ui/button"
import { formatOrderDate } from "@/components/portal/format"
import type { Locale } from "@/modules/_shared"
import type { CertificateView } from "@/modules/learning"

import { certificatePdfHref } from "./certificate-link"

/** DESIGN_SPEC CertificateCard: course, date, download, verification code in mono. */
export async function CertificateCard({ certificate, locale }: { certificate: CertificateView; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "portal.player" })
  return (
    <section
      aria-labelledby="certificate-card-heading"
      data-certificate-card
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card"
    >
      <h2 id="certificate-card-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
        <Certificate aria-hidden="true" size={22} weight="duotone" className="text-primary" />
        {certificate.courseTitle}
      </h2>
      <p className="text-fg-muted">{t("certificate_issued", { date: formatOrderDate(certificate.issuedAt, locale) })}</p>
      <p className="text-sm text-fg-muted">
        {t("certificate_code")} <span className="font-mono text-fg">{certificate.verificationCode}</span>
      </p>
      <Button asChild className="self-start">
        <a href={certificatePdfHref(certificate.id, locale)} download data-certificate-download>
          {t("certificate_download")}
        </a>
      </Button>
    </section>
  )
}
