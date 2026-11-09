/**
 * notifications/templates/i18n.ts
 *
 * ICU-aware translator + formatters for the Wave 3 templates.
 * Uses next-intl's createTranslator (full ICU: plural, select). A missing or
 * extra-less value throws, so a raw `{x}` can never reach an inbox: sendEmail
 * turns the throw into an UPSTREAM render error.
 */
import { createTranslator } from "next-intl"
import type { Locale } from "@/modules/_shared"

import frMsg from "@/i18n/messages/fr.json"
import enMsg from "@/i18n/messages/en.json"

type Namespace =
  | "reminder"
  | "waitlistSeatAvailable"
  | "cancellationConfirmation"
  | "certificateIssued"
  | "commentApproved"
  | "orderConfirmation"
  | "enrollmentConfirmation"

const allMessages = { fr: frMsg, en: enMsg } as const

export type Translate = (key: string, values?: Record<string, string | number>) => string

export function getTranslator(locale: Locale, ns: Namespace): Translate {
  const translator = createTranslator({
    locale,
    messages: allMessages[locale] as never,
    namespace: `notifications.${ns}` as never,
    onError: (err) => {
      throw err
    },
  }) as unknown as Translate
  return (key, values) => translator(key, values)
}

const lc = (locale: Locale) => (locale === "fr" ? "fr-CA" : "en-CA")

export function formatMoney(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(lc(locale), { style: "currency", currency: "CAD" }).format(
    cents / 100,
  )
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(lc(locale), {
    timeZone: "America/Toronto",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  }).format(new Date(iso))
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(lc(locale), {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso))
}

export type EmailLocation = {
  name: string
  address: string
  city: string
  postalCode?: string
  mapsUrl?: string
}

export function locationString(l: EmailLocation): string {
  return `${l.name}, ${l.address}, ${l.city}${l.postalCode ? ` ${l.postalCode}` : ""}`
}

export function googleCalendarUrl(
  title: string,
  startsAt: string,
  endsAt: string,
  location: string,
): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startsAt)}/${fmt(endsAt)}`,
    location,
    details: title,
  })
  return `https://www.google.com/calendar/render?${params}`
}
