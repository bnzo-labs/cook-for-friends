/**
 * notifications/templates/shared.tsx
 *
 * Shared React Email layout. No external CSS — all inline styles derived from
 * design token values in tokens.css (DESIGN_SPEC §1). No CSS files in email.
 */
import {
  Body as EmailBody,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import React from "react"

// ---------------------------------------------------------------------------
// Brand colors (inline hex equivalents of tokens.css values)
// ---------------------------------------------------------------------------
const colors = {
  bg: "#f9f8f6", // --brand-paper
  surface: "#ffffff",
  text: "#353028", // --brand-ink
  muted: "#6b625a", // --brand-stone-600
  border: "#e3ddd7", // --brand-stone-200
  accent: "#c0612a", // --brand-accent (terracotta)
} as const

// ---------------------------------------------------------------------------
// Shared layout component
// ---------------------------------------------------------------------------
interface EmailLayoutProps {
  preview: string
  footer: string
  children: React.ReactNode
}

export function EmailLayout({ preview, footer, children }: EmailLayoutProps) {
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <EmailBody
        style={{
          backgroundColor: colors.bg,
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: "0",
          padding: "0",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "40px auto",
            backgroundColor: colors.surface,
            borderRadius: "12px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {/* Header accent bar */}
          <Section
            style={{
              backgroundColor: colors.accent,
              padding: "16px 32px",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: "600",
                margin: "0",
                letterSpacing: "-0.01em",
              }}
            >
              Cook for Friends
            </Text>
          </Section>

          {/* Body content */}
          <Section style={{ padding: "32px 32px 24px" }}>{children}</Section>

          {/* Footer */}
          <Section
            style={{
              borderTop: `1px solid ${colors.border}`,
              padding: "16px 32px",
              backgroundColor: colors.bg,
            }}
          >
            <Text
              style={{
                color: colors.muted,
                fontSize: "12px",
                margin: "0",
                lineHeight: "1.5",
              }}
            >
              {footer}
            </Text>
          </Section>
        </Container>
      </EmailBody>
    </Html>
  )
}

// ---------------------------------------------------------------------------
// Typography helpers
// ---------------------------------------------------------------------------

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: "24px",
        fontWeight: "700",
        margin: "0 0 16px",
        lineHeight: "1.2",
        letterSpacing: "-0.02em",
      }}
    >
      {children}
    </Text>
  )
}

/** Paragraph body text. Named BodyText to avoid conflict with @react-email/components Body. */
export function BodyText({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: "15px",
        lineHeight: "1.6",
        margin: "0 0 16px",
      }}
    >
      {children}
    </Text>
  )
}

export function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: colors.muted,
        fontSize: "13px",
        lineHeight: "1.5",
        margin: "0 0 8px",
      }}
    >
      {children}
    </Text>
  )
}

export const brandColors = colors
