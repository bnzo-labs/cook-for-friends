import { getTranslations } from "next-intl/server"

import { listCustomerCertificates } from "@/modules/learning"
import type { ID, Locale } from "@/modules/_shared"

import { formatOrderDate } from "../format"
import { CertificateCard } from "./CertificateCard"

export interface CertificatesSectionProps {
  customerId: ID
  locale: Locale
}

/** History `#certificates`: one card per issued certificate, or a quiet empty line. */
export async function CertificatesSection({ customerId, locale }: CertificatesSectionProps) {
  const [t, certificates] = await Promise.all([
    getTranslations({ locale, namespace: "portal.history" }),
    listCustomerCertificates(customerId, locale),
  ])
  return (
    <section id="certificates" aria-labelledby="certificates-heading" data-certificates-slot className="flex scroll-mt-6 flex-col gap-4">
      <h2 id="certificates-heading" className="font-display text-xl font-semibold text-fg">
        {t("certificates_label")}
      </h2>
      {certificates.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {certificates.map((c) => (
            <CertificateCard
              key={String(c.id)}
              locale={locale}
              certificate={{ id: String(c.id), courseTitle: c.courseTitle, issuedAt: c.issuedAt, verificationCode: c.verificationCode }}
              labels={{
                issuedOn: t("certificates.issued_on", { date: formatOrderDate(c.issuedAt, locale) }),
                codeLabel: t("certificates.code_label"),
                download: t("certificates.download"),
                downloadAria: t("certificates.download_aria", { course: c.courseTitle }),
              }}
            />
          ))}
        </ul>
      ) : (
        <p data-certificates-empty className="rounded-card border border-dashed border-border bg-surface p-5 text-fg-muted">
          {t("certificates.empty")}
        </p>
      )}
    </section>
  )
}
