/**
 * notifications/templates/cancellation-confirmation.tsx (CCR-W3-3).
 *
 * recipient 'buyer'    -> outcome (refund | credit | none), amount, credit code
 *                         + expiry, order number.
 * recipient 'attendee' -> "your seat was cancelled by <name>". NEVER renders an
 *                         amount, credit code or order number (Q11/Q12).
 * No names in the subject line.
 */
import { render, toPlainText } from "@react-email/components"
import React from "react"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted } from "./shared"
import { CodeBox } from "./blocks"
import { formatDate, formatDateTime, formatMoney, getTranslator, type Translate } from "./i18n"

type Data = EmailData["cancellation-confirmation"]

function outcomeKey(outcome: Data["outcome"]): string {
  return outcome === "refund" ? "outcomeRefund" : outcome === "credit" ? "outcomeCredit" : "outcomeNone"
}

function BuyerBody({ locale, data, t }: { locale: Locale; data: Data; t: Translate }) {
  const amount = formatMoney(data.amount, locale)
  return (
    <>
      <BodyText>
        {t("buyerIntro", {
          attendeeName: data.attendeeName,
          courseTitle: data.courseTitle,
          date: formatDateTime(data.sessionStartsAt, locale),
        })}
      </BodyText>
      <BodyText>{t(outcomeKey(data.outcome), { amount })}</BodyText>
      {data.outcome === "credit" && data.creditCode && (
        <>
          <Muted>{t("creditCodeLabel")}</Muted>
          <CodeBox>{data.creditCode}</CodeBox>
          {data.creditExpiresAt && (
            <Muted>{t("creditExpires", { date: formatDate(data.creditExpiresAt, locale) })}</Muted>
          )}
        </>
      )}
      {data.orderNumber && <Muted>{t("orderNumber", { orderNumber: data.orderNumber })}</Muted>}
    </>
  )
}

function AttendeeBody({ locale, data, t }: { locale: Locale; data: Data; t: Translate }) {
  const date = formatDateTime(data.sessionStartsAt, locale)
  return (
    <>
      <BodyText>
        {data.cancelledByName
          ? t("attendeeIntroBy", {
              courseTitle: data.courseTitle,
              date,
              cancelledByName: data.cancelledByName,
            })
          : t("attendeeIntro", { courseTitle: data.courseTitle, date })}
      </BodyText>
      <Muted>{t("attendeeContact")}</Muted>
    </>
  )
}

function CancellationConfirmationEmail({
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
      {data.recipient === "buyer" ? (
        <BuyerBody locale={locale} data={data} t={t} />
      ) : (
        <AttendeeBody locale={locale} data={data} t={t} />
      )}
    </EmailLayout>
  )
}

export async function renderCancellationConfirmation(locale: Locale, data: Data) {
  const t = getTranslator(locale, "cancellationConfirmation")
  const html = await render(<CancellationConfirmationEmail locale={locale} data={data} t={t} />)
  return {
    subject: t("subject", { courseTitle: data.courseTitle }),
    html,
    text: toPlainText(html),
  }
}

export default CancellationConfirmationEmail
