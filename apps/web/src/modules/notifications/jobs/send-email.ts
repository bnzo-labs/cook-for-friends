/**
 * notifications/jobs/send-email.ts
 *
 * Payload Job task: 'send-email'.
 * Input: { template, to, locale, data, idempotencyKey, ics? }
 * Handler: build .ics attachments, call sendEmail, retries 3.
 */
import { z } from "zod"
import type { TaskConfig } from "payload"
import { sendEmail } from "../server/send"
import { buildIcs } from "../server/ics"
import type { Attachment } from "../types"

// ---------------------------------------------------------------------------
// Input validation schema (runtime guard)
// ---------------------------------------------------------------------------
const icsInputSchema = z.object({
  uid: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  location: z.string(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-/)),
  endsAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-/)),
  url: z.string().url(),
})

const sendEmailInputSchema = z.object({
  template: z.string().min(1),
  to: z.string().email(),
  locale: z.enum(["fr", "en"]),
  data: z.record(z.unknown()),
  idempotencyKey: z.string().min(1),
  ics: z.array(icsInputSchema).optional(),
})

// ---------------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------------
// Type-safe after types regeneration: 'send-email' is now in TypedJobs.tasks
export const sendEmailTask: TaskConfig<"send-email"> = {
  slug: "send-email",
  label: "Send Email",
  retries: 3,
  inputSchema: [
    { name: "template", type: "text" },
    { name: "to", type: "text" },
    { name: "locale", type: "text" },
    { name: "data", type: "json" },
    { name: "idempotencyKey", type: "text" },
    { name: "ics", type: "json" },
  ],
  handler: async ({ input }) => {
    const parsed = sendEmailInputSchema.safeParse(input)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      throw new Error(`send-email: invalid input — ${issues.join("; ")}`)
    }

    const { template, to, locale, data, idempotencyKey, ics } = parsed.data

    // Build .ics attachments
    const attachments: Attachment[] = []
    if (ics && ics.length > 0) {
      for (const item of ics) {
        const content = buildIcs({
          uid: item.uid,
          title: item.title,
          description: item.description,
          location: item.location,
          startsAt: new Date(item.startsAt),
          endsAt: new Date(item.endsAt),
          url: item.url,
        })
        attachments.push({
          filename: `event-${item.uid.slice(0, 8)}.ics`,
          content,
          contentType: "text/calendar; method=PUBLISH",
        })
      }
    }

    // Send the email
    const result = await sendEmail({
      template: template as Parameters<typeof sendEmail>[0]["template"],
      to,
      locale,
      // Safe: data was JSON-deserialized from job input
      data: data as Parameters<typeof sendEmail>[0]["data"],
      attachments: attachments.length > 0 ? attachments : undefined,
      idempotencyKey,
    })

    if (!result.ok) {
      // Throw so Payload retries the task
      const err = result.error
      const msg =
        err.code === "UPSTREAM"
          ? `send-email: upstream error — ${err.message}`
          : `send-email: error [${err.code}]`
      throw new Error(msg)
    }

    return { output: {} }
  },
}
