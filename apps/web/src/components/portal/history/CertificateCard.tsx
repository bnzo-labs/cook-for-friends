import { Button } from "@/components/ui/button"
import type { Locale } from "@/modules/_shared"

export type CertificateCardData = {
  id: string
  courseTitle: string
  issuedAt: string
  verificationCode: string
}

export interface CertificateCardProps {
  certificate: CertificateCardData
  locale: Locale
  labels: {
    issuedOn: string
    codeLabel: string
    download: string
    downloadAria: string
  }
}

/** DESIGN_SPEC CertificateCard: course, issue date, verification code (mono), PDF download. */
export function CertificateCard({ certificate, locale, labels }: CertificateCardProps) {
  return (
    <li
      data-certificate-card
      data-certificate-id={certificate.id}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-display text-lg font-semibold leading-tight text-fg">{certificate.courseTitle}</h3>
        <p className="text-sm text-fg-muted">
          <time dateTime={certificate.issuedAt}>{labels.issuedOn}</time>
        </p>
        <p className="text-sm text-fg-muted">
          {labels.codeLabel} <code className="break-all font-mono text-fg" data-certificate-code>{certificate.verificationCode}</code>
        </p>
      </div>
      <Button asChild variant="secondary" size="sm" className="self-start sm:self-center">
        <a
          href={`/api/certificates/${certificate.id}/pdf?locale=${locale}`}
          aria-label={labels.downloadAria}
          data-certificate-download
        >
          {labels.download}
        </a>
      </Button>
    </li>
  )
}
