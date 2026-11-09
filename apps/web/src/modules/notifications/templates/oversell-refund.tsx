/**
 * notifications/templates/oversell-refund.tsx
 *
 * Sent to the buyer when a session is oversold (all seats refunded). CCR-W2-6.
 * Mentions the number of seats refunded. refundAmount === 0 (100%-discount order,
 * nothing charged) renders "not confirmed / not charged" copy instead (W2-22).
 */
import { Hr, Section, Text } from "@react-email/components"
import React from "react"
import { render, toPlainText } from "@react-email/components"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted, brandColors } from "./shared"

import frMsg from "@/i18n/messages/fr.json"
import enMsg from "@/i18n/messages/en.json"

const msgs = {
  fr: frMsg.notifications.oversellRefund,
  en: enMsg.notifications.oversellRefund,
} as const

function t(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

function formatMoney(cents: number, locale: Locale): string {
  const lc = locale === "fr" ? "fr-CA" : "en-CA"
  return new Intl.NumberFormat(lc, { style: "currency", currency: "CAD" }).format(cents / 100)
}

type OversellRefundData = EmailData["oversell-refund"]

interface Props {
  locale: Locale
  data: OversellRefundData
}

function OversellRefundEmail({ locale, data }: Props) {
  const m = msgs[locale]
  const free = data.refundAmount === 0
  const seatsLabel = free
    ? data.quantity === 1
      ? m.seatsOneZero
      : t(m.seatsManyZero, { quantity: data.quantity })
    : data.quantity === 1
      ? m.seatsOne
      : t(m.seatsMany, { quantity: data.quantity })

  return (
    <EmailLayout
      preview={t(free ? m.previewZero : m.preview, { orderNumber: data.orderNumber })}
      footer={m.footer}
    >
      <Heading>{free ? m.headingZero : m.heading}</Heading>

      <BodyText>{free ? m.introZero : m.intro}</BodyText>

      <Section
        style={{
          marginBottom: "20px",
          padding: "16px",
          backgroundColor: "#fff4f0",
          borderRadius: "8px",
          border: `1px solid #f5cabb`,
        }}
      >
        <Text
          style={{
            color: brandColors.text,
            fontSize: "15px",
            fontWeight: "600",
            margin: "0 0 6px",
          }}
        >
          {data.courseTitle}
        </Text>
        <Text style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 4px" }}>
          {seatsLabel}
        </Text>
        <Text style={{ color: brandColors.text, fontSize: "14px", fontWeight: "600", margin: "0" }}>
          {free ? m.notCharged : t(m.refundAmount, { amount: formatMoney(data.refundAmount, locale) })}
        </Text>
      </Section>

      <Hr style={{ borderColor: brandColors.border, margin: "16px 0" }} />

      {!free && <Muted>{m.timeline}</Muted>}
      <Muted>{t(m.contact, { email: "support@cookforfriends.ca" })}</Muted>
    </EmailLayout>
  )
}

export async function renderOversellRefund(
  locale: Locale,
  data: OversellRefundData,
): Promise<{ subject: string; html: string; text: string }> {
  const m = msgs[locale]
  const element = <OversellRefundEmail locale={locale} data={data} />
  const html = await render(element)
  const text = toPlainText(html)
  const subjectKey = data.refundAmount === 0 ? m.subjectZero : m.subject
  return { subject: t(subjectKey, { orderNumber: data.orderNumber }), html, text }
}

export default OversellRefundEmail
