import type { Locale } from "@/modules/_shared"
import en from "@/i18n/messages/en.json"
import fr from "@/i18n/messages/fr.json"
import { getPayload } from "./payload"

export type MagicLinkEmailInput = {
  to: string
  locale: Locale
  link: string
  expiresInMinutes: number
}

/** Outbound port. W2-04 (notifications) replaces the default with its template. */
export type MagicLinkEmailSender = (input: MagicLinkEmailInput) => Promise<void>

const messages = { en: en.identity.email, fr: fr.identity.email } as const

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderMagicLinkEmail(input: MagicLinkEmailInput) {
  const m = messages[input.locale]
  const expiry = m.expiry.replace("{minutes}", String(input.expiresInMinutes))
  const text = [m.hello, "", m.intro, "", input.link, "", expiry, m.ignore].join("\n")
  const link = escapeHtml(input.link)
  const html = [
    `<p>${m.hello}</p>`,
    `<p>${m.intro}</p>`,
    `<p><a href="${link}">${m.cta}</a></p>`,
    `<p>${expiry}</p>`,
    `<p>${m.ignore}</p>`,
  ].join("\n")
  return { subject: m.subject, text, html }
}

/** Default sender: React Email magic-link template via notifications module. */
const resendSender: MagicLinkEmailSender = async (input) => {
  const { sendEmail } = await import("@/modules/notifications")
  const result = await sendEmail({
    template: "magic-link",
    to: input.to,
    locale: input.locale,
    data: { link: input.link, expiresInMinutes: input.expiresInMinutes },
    idempotencyKey: `magic-link:${input.to}:${Date.now()}`,
  })
  if (!result.ok) {
    // Fall back to plain payload.sendEmail so magic links always work
    const payload = await getPayload()
    await payload.sendEmail({ to: input.to, ...renderMagicLinkEmail(input) })
  }
}

let sender: MagicLinkEmailSender = resendSender

/** Swap the sender (tests, or the notifications module in W2-04). */
export function setMagicLinkEmailSender(next: MagicLinkEmailSender): void {
  sender = next
}

export function resetMagicLinkEmailSender(): void {
  sender = resendSender
}

export function sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<void> {
  return sender(input)
}
