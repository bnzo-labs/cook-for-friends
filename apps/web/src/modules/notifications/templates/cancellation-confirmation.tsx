/**
 * notifications/templates/cancellation-confirmation.tsx (CCR-W3-3).
 *
 * recipient 'buyer'    -> outcome (refund | credit | none), amount, credit code
 *                         + expiry, order number.
 * recipient 'attendee' -> "your seat was cancelled by <name>". NEVER renders an
 *                         amount, credit code or order number (Q11/Q12).
 * No names in the subject line.
 * reason 'session-cancelled' (W4-07) -> staff cancelled the whole session: "session
 *                         cancelled" copy, buyer sees the (full) refund amount.
 */
import { render, toPlainText } from "@react-email/components"
import React from "react"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted } from "./shared"
import { CodeBox } from "./blocks"
import { formatDate, formatDateTime, formatMoney, getTranslator, type Translate } from "./i18n"

type Data = EmailData["cancellation-confirmation"]

const isSession = (data: Data) => data.reason === "session-cancelled"

function outcomeKey(data: Data): string {
  if (data.outcome === "refund") return "outcomeRefund"
  if (data.outcome === "credit") return "outcomeCredit"
  return isSession(data) ? "sessionOutcomeNone" : "outcomeNone"
}

function BuyerBody({ locale, data, t }: { locale: Locale; data: Data; t: Translate }) {
  const amount = formatMoney(data.amount, locale)
  return (
    <>
      <BodyText>
        {t(isSession(data) ? "sessionBuyerIntro" : "buyerIntro", {
          attendeeName: data.attendeeName,
          courseTitle: data.courseTitle,
          date: formatDateTime(data.sessionStartsAt, locale),
        })}
      </BodyText>
      <BodyText>{t(outcomeKey(data), { amount })}</BodyText>
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
  if (isSession(data)) {
    return (
      <>
        <BodyText>{t("sessionAttendeeIntro", { courseTitle: data.courseTitle, date })}</BodyText>
        <Muted>{t("sessionAttendeeContact")}</Muted>
      </>
    )
  }
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
      preview={t(isSession(data) ? "sessionPreview" : "preview", { courseTitle: data.courseTitle })}
      footer={t("footer")}
    >
      <Heading>{t(isSession(data) ? "sessionHeading" : "heading")}</Heading>
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
    subject: t(isSession(data) ? "sessionSubject" : "subject", { courseTitle: data.courseTitle }),
    html,
    text: toPlainText(html),
  }
}

export default CancellationConfirmationEmail
