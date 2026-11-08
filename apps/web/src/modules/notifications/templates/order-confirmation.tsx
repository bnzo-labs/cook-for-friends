/**
 * notifications/templates/order-confirmation.tsx
 *
 * Order confirmation email for the buyer. FR + EN. CCR-W2-6.
 * - Shows each in-person item date/time in America/Toronto, location, maps link, Google Calendar link.
 * - Multi-seat: shows quantity × unit price, and when attendees[] non-empty a "Seats booked for" list.
 * - All copy from messages/{fr,en}.json notifications.orderConfirmation.*
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
  fr: frMsg.notifications.orderConfirmation,
  en: enMsg.notifications.orderConfirmation,
} as const

function t(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function formatMoney(cents: number, locale: Locale): string {
  const lc = locale === "fr" ? "fr-CA" : "en-CA"
  return new Intl.NumberFormat(lc, { style: "currency", currency: "CAD" }).format(cents / 100)
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

/** Build a Google Calendar "Add to Calendar" link. */
function googleCalendarUrl(
  title: string,
  startsAt: string,
  endsAt: string,
  location: string,
  description: string,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startsAt)}/${fmt(endsAt)}`,
    location,
    details: description,
  })
  return `https://www.google.com/calendar/render?${params}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type OrderConfirmationData = EmailData["order-confirmation"]

interface Props {
  locale: Locale
  data: OrderConfirmationData
}

function OrderConfirmationEmail({ locale, data }: Props) {
  const m = msgs[locale]

  return (
    <EmailLayout
      preview={t(m.preview, { orderNumber: data.orderNumber })}
      footer={m.footer}
    >
      <Heading>{m.heading}</Heading>

      {data.customerFirstName ? (
        <BodyText>{t(m.greeting, { name: data.customerFirstName })}</BodyText>
      ) : (
        <BodyText>{m.greetingAnon}</BodyText>
      )}

      <BodyText>{m.intro}</BodyText>

      <Text
        style={{
          color: brandColors.muted,
          fontSize: "12px",
          fontWeight: "600",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          margin: "0 0 4px",
        }}
      >
        {t(m.orderNumber, { number: data.orderNumber })}
      </Text>

      <Hr style={{ borderColor: brandColors.border, margin: "16px 0" }} />

      {/* Order items */}
      {data.items.map((item, idx) => (
        <Section
          key={idx}
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
              margin: "0 0 8px",
            }}
          >
            {item.title}
          </Text>

          {item.quantity > 1 && (
            <Text
              style={{ color: brandColors.text, fontSize: "14px", margin: "0 0 6px" }}
            >
              {t(m.qty, {
                quantity: item.quantity,
                unitPrice: formatMoney(Math.round(item.amount / item.quantity), locale),
              })}
            </Text>
          )}

          {item.sessionStartsAt && (
            <Text
              style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 4px" }}
            >
              {m.itemDateLabel} {formatDateTime(item.sessionStartsAt, locale)}
            </Text>
          )}

          {item.location && (
            <>
              <Text
                style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 2px" }}
              >
                {m.itemLocationLabel} {item.location.name}, {item.location.address},{" "}
                {item.location.city}
                {item.location.postalCode ? ` ${item.location.postalCode}` : ""}
              </Text>
              {item.location.mapsUrl && (
                <Link
                  href={item.location.mapsUrl}
                  style={{ color: brandColors.accent, fontSize: "13px", margin: "0 0 4px" }}
                >
                  {m.mapsLink}
                </Link>
              )}
            </>
          )}

          {/* Google Calendar link */}
          {item.sessionStartsAt && item.sessionEndsAt && (
            <Link
              href={googleCalendarUrl(
                item.title,
                item.sessionStartsAt,
                item.sessionEndsAt,
                item.location
                  ? `${item.location.name}, ${item.location.address}, ${item.location.city}`
                  : "",
                item.title,
              )}
              style={{
                display: "inline-block",
                marginTop: "8px",
                color: brandColors.accent,
                fontSize: "13px",
                textDecoration: "underline",
              }}
            >
              {m.addToCalendar}
            </Link>
          )}

          {/* Multi-seat attendee list */}
          {item.attendees && item.attendees.length > 0 && (
            <Section style={{ marginTop: "12px" }}>
              <Text
                style={{
                  color: brandColors.text,
                  fontSize: "13px",
                  fontWeight: "600",
                  margin: "0 0 4px",
                }}
              >
                {m.seatsFor}
              </Text>
              {item.attendees.map((a, i) => (
                <Text
                  key={i}
                  style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 2px" }}
                >
                  {a.name} — {a.email}
                </Text>
              ))}
              <Text
                style={{ color: brandColors.muted, fontSize: "12px", margin: "8px 0 0", fontStyle: "italic" }}
              >
                {m.guestEmailsNotice}
              </Text>
            </Section>
          )}
        </Section>
      ))}

      <Hr style={{ borderColor: brandColors.border, margin: "16px 0" }} />

      {/* Totals */}
      <Section style={{ marginBottom: "16px" }}>
        {data.subtotal !== data.total && (
          <Text
            style={{
              color: brandColors.muted,
              fontSize: "14px",
              margin: "0 0 4px",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            {m.subtotal}: {formatMoney(data.subtotal, locale)}
          </Text>
        )}
        {data.discountTotal > 0 && (
          <Text
            style={{ color: brandColors.muted, fontSize: "14px", margin: "0 0 4px" }}
          >
            {m.discount}: −{formatMoney(data.discountTotal, locale)}
          </Text>
        )}
        {data.taxTotal > 0 && (
          <Text
            style={{ color: brandColors.muted, fontSize: "14px", margin: "0 0 4px" }}
          >
            {m.tax}: {formatMoney(data.taxTotal, locale)}
          </Text>
        )}
        <Text
          style={{
            color: brandColors.text,
            fontSize: "16px",
            fontWeight: "700",
            margin: "4px 0 0",
          }}
        >
          {m.total}: {formatMoney(data.total, locale)}
        </Text>
      </Section>

      {data.receiptUrl && (
        <Section style={{ marginBottom: "16px" }}>
          <Link
            href={data.receiptUrl}
            style={{
              display: "inline-block",
              backgroundColor: brandColors.surface,
              border: `1px solid ${brandColors.border}`,
              borderRadius: "8px",
              padding: "10px 20px",
              color: brandColors.text,
              fontSize: "14px",
              textDecoration: "none",
              fontWeight: "500",
            }}
          >
            {m.viewReceipt}
          </Link>
        </Section>
      )}

      {data.contactEmail && (
        <Muted>{t(m.contact, { email: data.contactEmail })}</Muted>
      )}
    </EmailLayout>
  )
}

export async function renderOrderConfirmation(
  locale: Locale,
  data: OrderConfirmationData,
): Promise<{ subject: string; html: string; text: string }> {
  const m = msgs[locale]
  const element = <OrderConfirmationEmail locale={locale} data={data} />
  const html = await render(element)
  const text = toPlainText(html)
  return { subject: t(m.subject, { orderNumber: data.orderNumber }), html, text }
}

export default OrderConfirmationEmail
