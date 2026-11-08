/**
 * notifications/templates/enrollment-confirmation.tsx
 *
 * Guest-seat confirmation email. CCR-W2-6.
 * Sent to each guest attendee (index ≥ 1) after a multi-seat purchase.
 *
 * Rules per acceptance criteria:
 * - Shows "<buyerName> booked a seat for you"
 * - Course title, date/time in America/Toronto, location + maps link, Google Calendar link
 * - How to sign in with this email (text only — no magic link in Wave 2)
 * - NO prices, totals, order number or receipt
 * - Contact email if provided
 */
import { Hr, Link, Section, Text } from "@react-email/components"
import React from "react"
import { render, toPlainText } from "@react-email/components"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted, brandColors } from "./shared"

import frMsg from "@/i18n/messages/fr.json"
import enMsg from "@/i18n/messages/en.json"

const msgs = {
  fr: frMsg.notifications.enrollmentConfirmation,
  en: enMsg.notifications.enrollmentConfirmation,
} as const

function t(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

function formatDateTime(isoDate: string, locale: Locale): string {
  const lc = locale === "fr" ? "fr-CA" : "en-CA"
  return new Intl.DateTimeFormat(lc, {
    timeZone: "America/Toronto",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  }).format(new Date(isoDate))
}

function googleCalendarUrl(
  title: string,
  startsAt: string,
  endsAt: string,
  location: string,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startsAt)}/${fmt(endsAt)}`,
    location,
    details: title,
  })
  return `https://www.google.com/calendar/render?${params}`
}

type EnrollmentConfirmationData = EmailData["enrollment-confirmation"]

interface Props {
  locale: Locale
  data: EnrollmentConfirmationData
}

function EnrollmentConfirmationEmail({ locale, data }: Props) {
  const m = msgs[locale]
  const locationStr = `${data.location.name}, ${data.location.address}, ${data.location.city}${data.location.postalCode ? ` ${data.location.postalCode}` : ""}`

  return (
    <EmailLayout
      preview={t(m.preview, { buyerName: data.buyerName, courseTitle: data.courseTitle })}
      footer={m.footer}
    >
      <Heading>{m.heading}</Heading>

      <BodyText>{t(m.bookedBy, { buyerName: data.buyerName })}</BodyText>

      <Section
        style={{
          marginBottom: "20px",
          padding: "16px",
          backgroundColor: "#f9f8f6",
          borderRadius: "8px",
          border: `1px solid ${brandColors.border}`,
        }}
      >
        <Text
          style={{
            color: brandColors.text,
            fontSize: "15px",
            fontWeight: "600",
            margin: "0 0 12px",
          }}
        >
          {data.courseTitle}
        </Text>

        <Text
          style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 4px" }}
        >
          {m.dateLabel} {formatDateTime(data.sessionStartsAt, locale)}
        </Text>

        <Text
          style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 4px" }}
        >
          {m.locationLabel} {locationStr}
        </Text>

        {data.location.mapsUrl && (
          <Link
            href={data.location.mapsUrl}
            style={{ color: brandColors.accent, fontSize: "13px", margin: "0 0 4px" }}
          >
            {m.mapsLink}
          </Link>
        )}

        <Link
          href={googleCalendarUrl(
            data.courseTitle,
            data.sessionStartsAt,
            data.sessionEndsAt,
            locationStr,
          )}
          style={{
            display: "inline-block",
            marginTop: "8px",
            color: brandColors.accent,
            fontSize: "13px",
          }}
        >
          {m.addToCalendar}
        </Link>
      </Section>

      <Hr style={{ borderColor: brandColors.border, margin: "16px 0" }} />

      <BodyText>{m.signInInfo}</BodyText>

      {data.contactEmail && (
        <Muted>{t(m.contact, { email: data.contactEmail })}</Muted>
      )}
    </EmailLayout>
  )
}

export async function renderEnrollmentConfirmation(
  locale: Locale,
  data: EnrollmentConfirmationData,
): Promise<{ subject: string; html: string; text: string }> {
  const m = msgs[locale]
  const element = <EnrollmentConfirmationEmail locale={locale} data={data} />
  const html = await render(element)
  const text = toPlainText(html)
  return {
    subject: t(m.subject, { buyerName: data.buyerName, courseTitle: data.courseTitle }),
    html,
    text,
  }
}

export default EnrollmentConfirmationEmail
