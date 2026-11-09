/**
 * notifications/templates/waitlist-seat-available.tsx — a seat freed up (CCR-W3-3).
 * No reservation: first to pay wins. `bookUrl` is built by the sender.
 */
import { render, toPlainText } from "@react-email/components"
import React from "react"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted } from "./shared"
import { Card, CardLine, CardTitle, CtaButton, LocationLine, MapsLink } from "./blocks"
import { formatDateTime, getTranslator, type Translate } from "./i18n"

type Data = EmailData["waitlist-seat-available"]

function WaitlistSeatAvailableEmail({
  locale,
  data,
  t,
}: {
  locale: Locale
  data: Data
  t: Translate
}) {
  return (
    <EmailLayout
      locale={locale}
      preview={t("preview", { courseTitle: data.courseTitle })}
      footer={t("footer")}
    >
      <Heading>{t("heading")}</Heading>
      <BodyText>{t("intro", { courseTitle: data.courseTitle })}</BodyText>

      <Card>
        <CardTitle>{data.courseTitle}</CardTitle>
        <CardLine>
          {t("dateLabel")} {formatDateTime(data.sessionStartsAt, locale)}
        </CardLine>
        <LocationLine location={data.location} label={t("locationLabel")} />
        <MapsLink location={data.location} label={t("mapsLink")} />
      </Card>

      <CtaButton href={data.bookUrl}>{t("cta")}</CtaButton>
      <Muted>{t("firstToPay")}</Muted>
    </EmailLayout>
  )
}

export async function renderWaitlistSeatAvailable(locale: Locale, data: Data) {
  const t = getTranslator(locale, "waitlistSeatAvailable")
  const html = await render(<WaitlistSeatAvailableEmail locale={locale} data={data} t={t} />)
  return {
    subject: t("subject", { courseTitle: data.courseTitle }),
    html,
    text: toPlainText(html),
  }
}

export default WaitlistSeatAvailableEmail
