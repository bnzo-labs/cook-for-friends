import type { TaskConfig } from "payload"
import { z } from "zod"

import { syncCourseToStripe } from "./course"
import { syncDiscountToStripe } from "./discount"

const courseInput = z.object({ courseId: z.union([z.number().int().positive(), z.string().min(1)]) })
const discountInput = z.object({ discountCodeId: z.union([z.number().int().positive(), z.string().min(1)]) })

function parse<T>(schema: z.ZodType<T>, slug: string, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) {
    throw new Error(`${slug}: invalid input — ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`)
  }
  return r.data
}

export const stripeSyncCourseTask: TaskConfig<"stripe-sync-course"> = {
  slug: "stripe-sync-course",
  label: "Stripe sync: course",
  retries: 3,
  inputSchema: [{ name: "courseId", type: "number", required: true }],
  handler: async ({ input }) => {
    const { courseId } = parse(courseInput, "stripe-sync-course", input)
    const res = await syncCourseToStripe(courseId)
    if (res.ok) return { output: {} }
    // Not published / archived-never-synced: nothing to retry.
    if (res.error.code === "NOT_FOUND" || res.error.code === "CONFLICT") return { output: {} }
    throw new Error(`stripe-sync-course: ${res.error.code === "UPSTREAM" ? res.error.message : res.error.code}`)
  },
}

export const stripeSyncDiscountTask: TaskConfig<"stripe-sync-discount"> = {
  slug: "stripe-sync-discount",
  label: "Stripe sync: discount code",
  retries: 3,
  inputSchema: [{ name: "discountCodeId", type: "number", required: true }],
  handler: async ({ input }) => {
    const { discountCodeId } = parse(discountInput, "stripe-sync-discount", input)
    const res = await syncDiscountToStripe(discountCodeId)
    if (res.ok || res.error.code === "NOT_FOUND") return { output: {} }
    throw new Error(`stripe-sync-discount: ${res.error.code === "UPSTREAM" ? res.error.message : res.error.code}`)
  },
}
