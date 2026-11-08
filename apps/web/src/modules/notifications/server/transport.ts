/**
 * notifications/server/transport.ts
 *
 * Outbound email transport. Production path: Resend.
 * Test seam: call setEmailTransportForTests() in test setup.
 *
 * NEVER export secrets. RESEND_API_KEY lives only here.
 */
import type { Attachment } from "../types"

/** Abstract send interface. */
export type SendInput = {
  to: string
  subject: string
  html: string
  text: string
  attachments?: Attachment[]
  idempotencyKey?: string
}

export type SendResult = { id: string }

export type EmailTransport = (input: SendInput) => Promise<SendResult>

// ---------------------------------------------------------------------------
// Production transport (Resend)
// ---------------------------------------------------------------------------

function buildProductionTransport(): EmailTransport {
  return async ({ to, subject, html, text, attachments, idempotencyKey }) => {
    // Lazy import so tests never load the Resend SDK or touch process.env.RESEND_API_KEY
    const { Resend } = await import("resend")
    const { env } = await import("@/lib/env")

    const resend = new Resend(env.RESEND_API_KEY)
    const from = env.EMAIL_FROM
    const replyTo = env.EMAIL_REPLY_TO || undefined

    const result = await resend.emails.send(
      {
        from,
        ...(replyTo ? { replyTo } : {}),
        to,
        subject,
        html,
        text,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    )

    if (result.error) {
      throw new Error(`Resend error [${result.error.name}]: ${result.error.message}`)
    }

    return { id: result.data!.id }
  }
}

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

/** Captured calls by the test transport. */
export type CapturedEmail = SendInput & { sentAt: Date }

let _testTransport: EmailTransport | null = null

/**
 * Replace the transport for the current test suite.
 * Pass null to reset to production.
 */
export function setEmailTransportForTests(t: EmailTransport | null): void {
  _testTransport = t
}

/**
 * Build a simple recording transport for tests.
 * Returns a capture array and the transport function.
 */
export function buildTestTransport(): { captured: CapturedEmail[]; transport: EmailTransport } {
  const captured: CapturedEmail[] = []
  const transport: EmailTransport = async (input) => {
    captured.push({ ...input, sentAt: new Date() })
    return { id: `test-${Date.now()}` }
  }
  return { captured, transport }
}

// ---------------------------------------------------------------------------
// Public getter
// ---------------------------------------------------------------------------

export function getEmailTransport(): EmailTransport {
  if (_testTransport) return _testTransport
  return buildProductionTransport()
}
