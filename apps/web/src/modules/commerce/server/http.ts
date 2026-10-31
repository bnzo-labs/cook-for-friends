import { randomBytes } from "node:crypto"

import type { ModuleError } from "@/modules/_shared"

import { isCartToken } from "./validation"

/** Cart cookie (W2-04): 32 random bytes base64url, HttpOnly, SameSite=Lax, 30 days. */
export const CART_COOKIE = "cff_cart"
export const CART_COOKIE_MAX_AGE = 30 * 86_400

export function newCartToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Valid `cff_cart` from the Cookie header, else null (a malformed value is ignored). */
export function readCartToken(headers: Headers): string | null {
  const header = headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1 || part.slice(0, eq).trim() !== CART_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    return isCartToken(value) ? value : null
  }
  return null
}

export function cartCookieHeader(token: string, secure = process.env.NODE_ENV === "production"): string {
  return [
    `${CART_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${CART_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ")
}

/** CONFLICT reasons with their own localized message. */
const CONFLICT_KEYS = new Set(["COURSE_NOT_PURCHASABLE", "SESSION_NOT_BOOKABLE"])

const STATUS: Record<ModuleError["code"], number> = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  HOLD_EXPIRED: 409,
  CONFLICT: 409,
  UPSTREAM: 502,
}

export type ErrorEnvelope = {
  ok: false
  error: { code: string; messageKey: string; details?: unknown; issues?: { path: string; message: string }[] }
}

/**
 * CONTRACT §2: `ModuleError` → HTTP status + `errors.<code>` envelope.
 * VALIDATION issues are in `details.issues` (contract) and `issues` (same shape
 * as the identity routes). UPSTREAM messages are logged, never returned.
 */
export function moduleErrorResponse(error: ModuleError, details?: unknown): { status: number; body: ErrorEnvelope } {
  const status = STATUS[error.code]
  if (error.code === "VALIDATION") {
    return {
      status,
      body: { ok: false, error: { code: error.code, messageKey: "errors.VALIDATION", details: { issues: error.issues }, issues: error.issues } },
    }
  }
  const messageKey =
    error.code === "CONFLICT" && CONFLICT_KEYS.has(error.reason) ? `errors.${error.reason}` : `errors.${error.code}`
  const extra = error.code === "CONFLICT" ? { reason: error.reason } : {}
  return {
    status,
    body: { ok: false, error: { code: error.code, messageKey, ...(details !== undefined ? { details } : {}), ...extra } },
  }
}
