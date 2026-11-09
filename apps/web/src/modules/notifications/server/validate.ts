/**
 * notifications/server/validate.ts — Zod guards for the Wave 3 template data
 * (CCR-W3-3). The send-email job hands `data` over as an untyped record, so
 * sendEmail re-validates before rendering.
 */
import { z } from "zod"
import type { EmailTemplate } from "../types"

const iso = z.string().min(1)
const url = z.string().url()
const location = z.object({
  name: z.string(),
  address: z.string(),
  city: z.string(),
  postalCode: z.string().optional(),
  mapsUrl: z.string().url().optional(),
})

export const w3DataSchemas = {
  reminder: z.object({
    attendeeFirstName: z.string().optional(),
    courseTitle: z.string().min(1),
    sessionStartsAt: iso,
    sessionEndsAt: iso,
    location,
    hoursBefore: z.number().int().nonnegative(),
    accountUrl: url,
    contactEmail: z.string().optional(),
  }),
  "waitlist-seat-available": z.object({
    courseTitle: z.string().min(1),
    sessionStartsAt: iso,
    location,
    bookUrl: url,
  }),
  "cancellation-confirmation": z.object({
    recipient: z.enum(["buyer", "attendee"]),
    attendeeName: z.string().min(1),
    cancelledByName: z.string().optional(),
    courseTitle: z.string().min(1),
    sessionStartsAt: iso,
    outcome: z.enum(["refund", "credit", "none"]),
    amount: z.number().int().nonnegative(),
    currency: z.literal("cad"),
    creditCode: z.string().optional(),
    creditExpiresAt: iso.optional(),
    orderNumber: z.string().optional(),
  }),
  "certificate-issued": z.object({
    customerFirstName: z.string().optional(),
    courseTitle: z.string().min(1),
    verificationCode: z.string().min(1),
    downloadUrl: url,
    verifyUrl: url,
  }),
  "comment-approved": z.object({
    customerFirstName: z.string().optional(),
    courseTitle: z.string().min(1),
    lessonTitle: z.string().min(1),
    lessonUrl: url,
  }),
} as const

export function validateTemplateData(
  template: EmailTemplate,
  data: unknown,
): { path: string; message: string }[] {
  const schema = (w3DataSchemas as Record<string, z.ZodTypeAny>)[template]
  if (!schema) return []
  const parsed = schema.safeParse(data)
  if (parsed.success) return []
  return parsed.error.issues.map((i) => ({
    path: ["data", ...i.path].join("."),
    message: i.message,
  }))
}
