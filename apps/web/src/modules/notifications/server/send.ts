/**
 * notifications/server/send.ts
 *
 * sendEmail — render + send one transactional email.
 *
 * CONTRACT §4 signature:
 *   sendEmail<T extends EmailTemplate>(i: { template, to, locale, data, attachments?, idempotencyKey }): Promise<Result<{ id: string }>>
 *
 * For Wave 3 templates (not yet implemented) returns VALIDATION error.
 */
import type { Locale } from "@/modules/_shared"
import type { Result } from "@/modules/_shared"
import type { EmailTemplate, EmailData, Attachment } from "../types"
import { WAVE2_TEMPLATES } from "../types"
import { getEmailTransport } from "./transport"

import { renderMagicLink } from "../templates/magic-link"
import { renderOrderConfirmation } from "../templates/order-confirmation"
import { renderEnrollmentConfirmation } from "../templates/enrollment-confirmation"
import { renderOversellRefund } from "../templates/oversell-refund"
import { renderRefundIssued } from "../templates/refund-issued"

// ---------------------------------------------------------------------------
// Renderer dispatch (Wave 2 only)
// ---------------------------------------------------------------------------

async function renderTemplate<T extends EmailTemplate>(
  template: T,
  locale: Locale,
  data: EmailData[T],
): Promise<{ subject: string; html: string; text: string }> {
  switch (template) {
    case "magic-link":
      return renderMagicLink(locale, data as EmailData["magic-link"])
    case "order-confirmation":
      return renderOrderConfirmation(locale, data as EmailData["order-confirmation"])
    case "enrollment-confirmation":
      return renderEnrollmentConfirmation(locale, data as EmailData["enrollment-confirmation"])
    case "oversell-refund":
      return renderOversellRefund(locale, data as EmailData["oversell-refund"])
    case "refund-issued":
      return renderRefundIssued(locale, data as EmailData["refund-issued"])
    default:
      throw new Error(`Unreachable: template "${template}" slipped past WAVE2_TEMPLATES guard`)
  }
}

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

export async function sendEmail<T extends EmailTemplate>(i: {
  template: T
  to: string
  locale: Locale
  data: EmailData[T]
  attachments?: Attachment[]
  idempotencyKey: string
}): Promise<Result<{ id: string }>> {
  if (!WAVE2_TEMPLATES.has(i.template)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        issues: [
          {
            path: "template",
            message: `Template "${i.template}" is not implemented in Wave 2`,
          },
        ],
      },
    }
  }

  let rendered: { subject: string; html: string; text: string }
  try {
    rendered = await renderTemplate(i.template, i.locale, i.data)
  } catch (err) {
    console.error("[sendEmail] render failed", { template: i.template, locale: i.locale }, err)
    return {
      ok: false,
      error: {
        code: "UPSTREAM",
        service: "resend",
        message: err instanceof Error ? err.message : "Render error",
      },
    }
  }

  try {
    const transport = getEmailTransport()
    const result = await transport({
      to: i.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: i.attachments,
      idempotencyKey: i.idempotencyKey,
    })
    return { ok: true, data: { id: result.id } }
  } catch (err) {
    console.error("[sendEmail] transport failed", { template: i.template, to: i.to }, err)
    return {
      ok: false,
      error: {
        code: "UPSTREAM",
        service: "resend",
        message: err instanceof Error ? err.message : "Transport error",
      },
    }
  }
}
