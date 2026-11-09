/**
 * notifications/server/send.ts
 *
 * sendEmail — render + send one transactional email.
 *
 * CONTRACT §4 signature:
 *   sendEmail<T extends EmailTemplate>(i: { template, to, locale, data, attachments?, idempotencyKey }): Promise<Result<{ id: string }>>
 *
 * Unknown template or invalid Wave 3 data returns a VALIDATION error.
 */
import type { Locale } from "@/modules/_shared"
import type { Result } from "@/modules/_shared"
import type { EmailTemplate, EmailData, Attachment } from "../types"
import { validateTemplateData } from "./validate"
import { getEmailTransport } from "./transport"

import { renderMagicLink } from "../templates/magic-link"
import { renderOrderConfirmation } from "../templates/order-confirmation"
import { renderEnrollmentConfirmation } from "../templates/enrollment-confirmation"
import { renderOversellRefund } from "../templates/oversell-refund"
import { renderRefundIssued } from "../templates/refund-issued"
import { renderReminder } from "../templates/reminder"
import { renderWaitlistSeatAvailable } from "../templates/waitlist-seat-available"
import { renderCancellationConfirmation } from "../templates/cancellation-confirmation"
import { renderCertificateIssued } from "../templates/certificate-issued"
import { renderCommentApproved } from "../templates/comment-approved"

// ---------------------------------------------------------------------------
// Renderer dispatch
// ---------------------------------------------------------------------------

class UnknownTemplateError extends Error {
  constructor(template: string) {
    super(`Unknown email template "${template}"`)
    this.name = "UnknownTemplateError"
  }
}

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
    case "reminder":
      return renderReminder(locale, data as EmailData["reminder"])
    case "waitlist-seat-available":
      return renderWaitlistSeatAvailable(locale, data as EmailData["waitlist-seat-available"])
    case "cancellation-confirmation":
      return renderCancellationConfirmation(
        locale,
        data as EmailData["cancellation-confirmation"],
      )
    case "certificate-issued":
      return renderCertificateIssued(locale, data as EmailData["certificate-issued"])
    case "comment-approved":
      return renderCommentApproved(locale, data as EmailData["comment-approved"])
    default:
      throw new UnknownTemplateError(String(template))
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
  const issues = validateTemplateData(i.template, i.data)
  if (issues.length > 0) {
    return { ok: false, error: { code: "VALIDATION", issues } }
  }

  let rendered: { subject: string; html: string; text: string }
  try {
    rendered = await renderTemplate(i.template, i.locale, i.data)
  } catch (err) {
    if (err instanceof UnknownTemplateError) {
      return {
        ok: false,
        error: { code: "VALIDATION", issues: [{ path: "template", message: err.message }] },
      }
    }
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
