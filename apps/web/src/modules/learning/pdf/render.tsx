import { renderToBuffer } from "@react-pdf/renderer"
import { createTranslator } from "next-intl"

import enMsg from "@/i18n/messages/en.json"
import frMsg from "@/i18n/messages/fr.json"
import type { ID, Locale } from "@/modules/_shared"

import { getPayload } from "../server/payload"
import { verifyUrl } from "../server/urls"
import { CertificateDocument, type CertificateStrings } from "./certificate-document"

const MESSAGES = { fr: frMsg, en: enMsg } as const

/** Localized long date, Toronto time zone, no forced capitalisation. */
export function formatCertificateDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso))
}

export function certificateStrings(
  locale: Locale,
  values: { date: string; url: string },
): CertificateStrings {
  const t = createTranslator({
    locale,
    messages: MESSAGES[locale] as never,
    namespace: "learning.certificate" as never,
    onError: (err) => {
      throw err
    },
  }) as unknown as (key: string, values?: Record<string, string>) => string
  return {
    title: t("title"),
    awardedTo: t("awardedTo"),
    forCompleting: t("forCompleting"),
    issuedOn: t("issuedOn", { date: values.date }),
    codeLabel: t("codeLabel"),
    verifyAt: t("verifyAt", { url: values.url }),
    issuer: t("issuer"),
    logoPlaceholder: t("logoPlaceholder"),
  }
}

/** A4 landscape certificate in `locale` (the route's `?locale=`, default: the certificate's own). */
export async function renderCertificatePdf(certificateId: ID, locale: Locale): Promise<Buffer> {
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "certificates",
    where: { id: { equals: certificateId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const cert = docs[0]
  if (!cert) throw new Error(`[learning] certificate ${String(certificateId)} not found`)

  const snap = cert.courseTitleSnapshot ?? { fr: "", en: "" }
  const courseTitle = (snap[locale] || snap.fr || snap.en || "") as string
  const strings = certificateStrings(locale, {
    date: formatCertificateDate(cert.issuedAt, locale),
    url: verifyUrl(locale, cert.verificationCode),
  })
  const element = (
    <CertificateDocument
      customerName={cert.customerNameSnapshot}
      courseTitle={courseTitle}
      verificationCode={cert.verificationCode}
      strings={strings}
    />
  )
  return renderToBuffer(element)
}
