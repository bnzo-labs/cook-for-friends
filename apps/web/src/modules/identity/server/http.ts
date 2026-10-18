import { z } from "zod"

import { locales } from "@/i18n/locales"

export const requestBodySchema = z.object({
  email: z.string().trim().email().max(254),
  locale: z.enum(locales),
  next: z.string().max(512).optional(),
})

export const verifyBodySchema = z.object({
  token: z.string().min(20).max(256),
})

/** Read a JSON or form-encoded body into a plain object. Unparseable → {}. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? ""
  try {
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData()
      return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"))
    }
    const json: unknown = await request.json()
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Best-effort client IP. Vercel sets `x-forwarded-for` (client first) and
 * `x-real-ip`. Falls back to "unknown" so the NOT NULL column is always filled.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (forwarded || headers.get("x-real-ip") || "unknown").slice(0, 64)
}

/**
 * CSRF guard for cookie-bearing POSTs (SameSite=Lax + Origin check). Browsers
 * always send Origin on cross-origin POST; non-browser clients (tests, curl)
 * send none and are allowed because they cannot ride a victim's cookies.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  const allowed = new Set([new URL(request.url).origin])
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin)
    } catch {
      // Malformed site URL: only same-origin is allowed.
    }
  }
  return allowed.has(origin)
}

export function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  })
}

export const forbiddenOrigin = () =>
  jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", messageKey: "errors.FORBIDDEN" } })
