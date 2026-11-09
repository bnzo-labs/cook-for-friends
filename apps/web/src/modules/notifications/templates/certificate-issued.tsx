/**
 * notifications/templates/certificate-issued.tsx (CCR-W3-3).
 * downloadUrl = portal page (auth required); verifyUrl = public verify page.
 */
import { Link, render, toPlainText } from "@react-email/components"
import React from "react"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted, brandColors } from "./shared"
import { CodeBox, CtaButton } from "./blocks"
import { getTranslator, type Translate } from "./i18n"

type Data = EmailData["certificate-issued"]

function CertificateIssuedEmail({ locale, data, t }: { locale: Locale; data: Data; t: Translate }) {
  return (
    <EmailLayout
      locale={locale}
      preview={t("preview", { courseTitle: data.courseTitle })}
      footer={t("footer")}
    >
      <Heading>{t("heading")}</Heading>
      <BodyText>
        {data.customerFirstName
          ? t("greeting", { name: data.customerFirstName })
          : t("greetingAnon")}
      </BodyText>
      <BodyText>{t("intro", { courseTitle: data.courseTitle })}</BodyText>

      <CtaButton href={data.downloadUrl}>{t("downloadCta")}</CtaButton>
      <Muted>{t("downloadNote")}</Muted>

      <BodyText>{t("verifyIntro")}</BodyText>
      <CodeBox>{data.verificationCode}</CodeBox>
      <Muted>
        <Link href={data.verifyUrl} style={{ color: brandColors.accent }}>
          {t("verifyLink")}
        </Link>
      </Muted>
    </EmailLayout>
  )
}

export async function renderCertificateIssued(locale: Locale, data: Data) {
  const t = getTranslator(locale, "certificateIssued")
  const html = await render(<CertificateIssuedEmail locale={locale} data={data} t={t} />)
  return {
    subject: t("subject", { courseTitle: data.courseTitle }),
    html,
    text: toPlainText(html),
  }
}

export default CertificateIssuedEmail
