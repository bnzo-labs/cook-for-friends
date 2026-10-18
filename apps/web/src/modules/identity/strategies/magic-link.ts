import { createHmac, timingSafeEqual } from "node:crypto"
import { JWT_AUTH_VERSION } from "payload"
import type { AuthStrategy } from "payload"
import { parseCookies } from "payload/shared"

type JwtClaims = { id?: unknown; collection?: unknown; exp?: unknown }

function decodeSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}

/**
 * Verify a Payload-format HS256 JWT (as produced by `jwtSign`). Payload's own
 * `local-jwt` strategy refuses collections with `disableLocalStrategy`, so the
 * customers collection verifies its cookie here. Returns claims or null.
 */
export function verifyCustomerJwt(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [h, p, s] = parts as [string, string, string]
  const header = decodeSegment<{ alg?: string; authVersion?: number }>(h)
  if (!header || header.alg !== "HS256" || header.authVersion !== JWT_AUTH_VERSION) return null

  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest()
  const given = Buffer.from(s, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const claims = decodeSegment<JwtClaims>(p)
  if (!claims || typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null
  if (claims.collection !== "customers") return null
  if (typeof claims.id !== "number" && typeof claims.id !== "string") return null
  return { id: claims.id }
}

/**
 * Custom auth strategy for `customers`: validates the Payload-format cookie and
 * loads the customer. Returns `user: null` for anything else (staff tokens,
 * anonymous, tampered, expired, deleted customer).
 */
export const magicLinkStrategy: AuthStrategy = {
  name: "magic-link",
  authenticate: async ({ headers, payload }) => {
    const token = parseCookies(headers).get(`${payload.config.cookiePrefix}-token`)
    if (!token) return { user: null }

    const claims = verifyCustomerJwt(token, payload.secret)
    if (!claims) return { user: null }

    try {
      const customer = await payload.findByID({
        collection: "customers",
        id: claims.id,
        depth: 0,
        overrideAccess: true,
      })
      return {
        user: { ...customer, collection: "customers", _strategy: "magic-link" },
      }
    } catch {
      // Unknown or deleted customer: treat as anonymous.
      return { user: null }
    }
  },
}
