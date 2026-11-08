/**
 * notifications/templates/magic-link.tsx
 *
 * Magic-link sign-in email. FR + EN.
 * All copy from messages/{fr,en}.json notifications.magicLink.*
 */
import { Button, Hr, Section, Text } from "@react-email/components"
import React from "react"
import { render, toPlainText } from "@react-email/components"
import type { Locale } from "@/modules/_shared"
import type { EmailData } from "../types"
import { EmailLayout, Heading, BodyText, brandColors } from "./shared"

import frMsg from "@/i18n/messages/fr.json"
import enMsg from "@/i18n/messages/en.json"

const msgs = { fr: frMsg.notifications.magicLink, en: enMsg.notifications.magicLink } as const

// Simple {var} replacement
function t(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

interface Props {
  locale: Locale
  data: EmailData["magic-link"]
}

function MagicLinkEmail({ locale, data }: Props) {
  const m = msgs[locale]
  return (
    <EmailLayout preview={m.preview} footer={m.subject}>
      <Heading>{m.heading}</Heading>
      <BodyText>{m.intro}</BodyText>

      <Section style={{ margin: "24px 0" }}>
        <Button
          href={data.link}
          style={{
            display: "inline-block",
            backgroundColor: brandColors.accent,
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: "600",
            textDecoration: "none",
            borderRadius: "8px",
            padding: "12px 24px",
          }}
        >
          {m.cta}
        </Button>
      </Section>

      <Hr style={{ borderColor: brandColors.border, margin: "16px 0" }} />

      <Text
        style={{
          color: brandColors.muted,
          fontSize: "13px",
          lineHeight: "1.5",
          margin: "0 0 8px",
        }}
      >
        {t(m.expiry, { minutes: data.expiresInMinutes })}
      </Text>
      <Text
        style={{
          color: brandColors.muted,
          fontSize: "13px",
          lineHeight: "1.5",
          margin: "0",
        }}
      >
        {m.ignore}
      </Text>
    </EmailLayout>
  )
}

export async function renderMagicLink(
  locale: Locale,
  data: EmailData["magic-link"],
): Promise<{ subject: string; html: string; text: string }> {
  const m = msgs[locale]
  const element = <MagicLinkEmail locale={locale} data={data} />
  const html = await render(element)
  const text = toPlainText(html)
  return { subject: m.subject, html, text }
}

export default MagicLinkEmail
