/**
 * notifications/templates/blocks.tsx — small presentational blocks shared by
 * the Wave 3 templates (and the account link block of the Wave 2 ones).
 * Inline styles only; colors from shared.tsx.
 */
import { Link, Section, Text } from "@react-email/components"
import React from "react"
import { brandColors, BodyText } from "./shared"
import type { EmailLocation } from "./i18n"
import { locationString } from "./i18n"

export function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ margin: "8px 0 20px" }}>
      <Link
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: brandColors.accent,
          color: "#ffffff",
          borderRadius: "8px",
          padding: "12px 24px",
          fontSize: "15px",
          fontWeight: "600",
          textDecoration: "none",
        }}
      >
        {children}
      </Link>
    </Section>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <Section
      style={{
        marginBottom: "20px",
        padding: "16px",
        backgroundColor: brandColors.bg,
        borderRadius: "8px",
        border: `1px solid ${brandColors.border}`,
      }}
    >
      {children}
    </Section>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{ color: brandColors.text, fontSize: "15px", fontWeight: "600", margin: "0 0 12px" }}
    >
      {children}
    </Text>
  )
}

export function CardLine({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: brandColors.muted, fontSize: "13px", margin: "0 0 4px" }}>
      {children}
    </Text>
  )
}

export function CodeBox({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: '"SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: "18px",
        letterSpacing: "0.06em",
        color: brandColors.text,
        backgroundColor: brandColors.bg,
        border: `1px solid ${brandColors.border}`,
        borderRadius: "8px",
        padding: "10px 14px",
        margin: "0 0 12px",
        display: "inline-block",
      }}
    >
      {children}
    </Text>
  )
}

export function MapsLink({ location, label }: { location: EmailLocation; label: string }) {
  if (!location.mapsUrl) return null
  return (
    <Link
      href={location.mapsUrl}
      style={{ color: brandColors.accent, fontSize: "13px", margin: "0 0 4px" }}
    >
      {label}
    </Link>
  )
}

export function LocationLine({ location, label }: { location: EmailLocation; label: string }) {
  return (
    <CardLine>
      {label} {locationString(location)}
    </CardLine>
  )
}

/** "Access your account" block. Renders nothing without a URL. */
export function AccountBlock({
  url,
  intro,
  cta,
}: {
  url: string | undefined
  intro: string
  cta: string
}) {
  if (!url) return null
  return (
    <Section style={{ marginTop: "8px" }}>
      <BodyText>{intro}</BodyText>
      <CtaButton href={url}>{cta}</CtaButton>
    </Section>
  )
}
