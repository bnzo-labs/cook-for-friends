// src/modules/_shared/types.ts  (owned by platform, read-only for all)
// Verbatim from CONTRACT §2. Do not modify without an orchestrator decision.
export type Locale = "fr" | "en"
export type ID = string | number // Payload id (postgres: number)
export type ISODate = string
export type Money = { amount: number; currency: "cad" } // amount in cents

export type CourseFormat = "in_person" | "online"
export type EntitlementSource = "purchase" | "gift" | "manual" | "membership"

export type ModuleError =
  | { code: "NOT_FOUND"; entity: string }
  | { code: "FORBIDDEN" }
  | { code: "SOLD_OUT"; sessionId: ID }
  | { code: "HOLD_EXPIRED"; holdId: ID }
  | { code: "VALIDATION"; issues: { path: string; message: string }[] }
  | { code: "CONFLICT"; reason: string }
  | { code: "UPSTREAM"; service: "stripe" | "resend" | "video"; message: string }

export type Result<T> = { ok: true; data: T } | { ok: false; error: ModuleError }
