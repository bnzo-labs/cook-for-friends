import { ValidationError } from "payload"

/**
 * Unique-key conflict detection that never reads localized message text.
 *
 * `@payloadcms/drizzle` turns PG 23505 into a `ValidationError` whose
 * `data.errors[].path` is the field name or the constraint's SQL columns
 * ("customer_id, lesson_id"). A conflict is ours when EVERY error path is made
 * only of columns from `columns`. A raw 23505 up to two causes deep also counts.
 */
export function isUniqueConflict(error: unknown, columns: ReadonlySet<string>): boolean {
  const e = error as { code?: string; cause?: { code?: string; cause?: { code?: string } } } | null
  if (e?.code === "23505" || e?.cause?.code === "23505" || e?.cause?.cause?.code === "23505") return true

  if (error instanceof ValidationError || (error instanceof Error && error.name === "ValidationError")) {
    const errors = (error as ValidationError).data?.errors
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.every((f) => {
        const parts = String(f?.path ?? "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
        return parts.length > 0 && parts.every((p) => columns.has(p))
      })
    }
  }
  return false
}

/** lesson-progress UNIQUE (customer, lesson). */
export const PROGRESS_UNIQUE_COLS: ReadonlySet<string> = new Set(["customer_id", "lesson_id", "customer", "lesson"])
/** certificates UNIQUE (customer, course). */
export const CERT_PAIR_UNIQUE_COLS: ReadonlySet<string> = new Set(["customer_id", "course_id", "customer", "course"])
/** certificates UNIQUE verification_code. */
export const CERT_CODE_UNIQUE_COLS: ReadonlySet<string> = new Set(["verification_code", "verificationCode"])
