/**
 * notifications/templates/refund-issued.tsx
 *
 * Sent to the buyer when a manual refund is issued.
 * Full or partial, buyer only.
 */
import { Hr } from "@react-email/components"
import React from "react"
import { render, toPlainText } from "@react-email/components"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, Muted, brandColors } from "./shared"

import frMsg from "@/i18n/messages/fr.json"
import enMsg from "@/i18n/messages/en.json"

const msgs = {
  fr: frMsg.notifications.refundIssued,
  en: enMsg.notifications.refundIssued,
} as const

function t(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

function formatMoney(cents: number, locale: Locale): string {
  const lc = locale === "fr" ? "fr-CA" : "en-CA"
  return new Intl.NumberFormat(lc, { style: "currency", currency: "CAD" }).format(cents / 100)
}

type RefundIssuedData = EmailData["refund-issued"]

interface Props {
  locale: Locale
  data: RefundIssuedData
}

function RefundIssuedEmail({ locale, data }: Props) {
  const m = msgs[locale]
  const body = data.full
    ? t(m.full, { orderNumber: data.orderNumber })
    : t(m.partial, {
        amount: formatMoney(data.refundAmount, locale),
        orderNumber: data.orderNumber,
      })

  return (
    <EmailLayout
      preview={t(m.preview, { orderNumber: data.orderNumber })}
      footer={m.footer}
    >
      <Heading>{m.heading}</Heading>
      <BodyText>{body}</BodyText>

      <Hr style={{ borderColor: brandColors.border, margin: "16px 0" }} />

      <Muted>{m.timeline}</Muted>
      <Muted>{t(m.contact, { email: "support@cookforfriends.ca" })}</Muted>
    </EmailLayout>
  )
}

export async function renderRefundIssued(
  locale: Locale,
  data: RefundIssuedData,
): Promise<{ subject: string; html: string; text: string }> {
  const m = msgs[locale]
  const element = <RefundIssuedEmail locale={locale} data={data} />
  const html = await render(element)
  const text = toPlainText(html)
  return { subject: t(m.subject, { orderNumber: data.orderNumber }), html, text }
}

export default RefundIssuedEmail
