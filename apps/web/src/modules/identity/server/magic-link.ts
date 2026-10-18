import { createHash, randomBytes } from "node:crypto"
import { and, eq, gt, isNull } from "@payloadcms/db-postgres/drizzle"
import { jwtSign, getFieldsToSign, createLocalReq } from "payload"
import type { Payload } from "payload"
import { addSessionToUser, generatePayloadCookie } from "payload/shared"

import type { Customer } from "@/payload-types"
import { defaultLocale, locales } from "@/i18n/locales"
import { getPayload } from "./payload"
import type { ID, Locale, Result } from "@/modules/_shared"
import type { CustomerView } from "../types"
import { sanitizeNext } from "./next-path"
import { sendMagicLinkEmail } from "./ports"
import { consumeRateLimit, EMAIL_LIMIT, IP_LIMIT, pruneRateLimits } from "./rate-limit"

export const MAGIC_LINK_TTL_MINUTES = 15
export const RATE_LIMITED_REASON = "MAGIC_LINK_RATE_LIMITED"
export const INVALID_TOKEN_MESSAGE = "MAGIC_LINK_INVALID"

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
const newToken = () => randomBytes(32).toString("base64url")

const isLocale = (value: unknown): value is Locale => (locales as readonly unknown[]).includes(value)

export function toCustomerView(c: Customer): CustomerView {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    phone: c.phone ?? null,
    preferredLocale: isLocale(c.preferredLocale) ? c.preferredLocale : defaultLocale,
    stripeCustomerId: c.stripeCustomerId ?? null,
    marketingConsent: Boolean(c.marketingConsent),
  }
}

async function findCustomerByEmail(payload: Payload, email: string): Promise<Customer | null> {
  const { docs } = await payload.find({
    collection: "customers",
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

export async function upsertCustomerByEmail(i: {
  email: string
  locale: Locale
  firstName?: string
  lastName?: string
}): Promise<CustomerView> {
  const payload = await getPayload()
  const email = normalizeEmail(i.email)
  const existing = await findCustomerByEmail(payload, email)
  if (existing) return toCustomerView(existing)
  try {
    const created = await payload.create({
      collection: "customers",
      data: { email, preferredLocale: i.locale, firstName: i.firstName, lastName: i.lastName },
      overrideAccess: true,
    })
    return toCustomerView(created)
  } catch (error) {
    // Lost a race on the unique email: the other writer's row is the answer.
    const raced = await findCustomerByEmail(payload, email)
    if (raced) return toCustomerView(raced)
    throw error
  }
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

/**
 * Step 1 of the flow. Always resolves `ok` for valid input regardless of whether
 * the email is known (no enumeration); only rate limiting returns an error.
 */
export async function requestMagicLink(i: {
  email: string
  locale: Locale
  next?: string
  ip: string
}): Promise<Result<void>> {
  const payload = await getPayload()
  const email = normalizeEmail(i.email)

  const ipDecision = await consumeRateLimit(payload, { scope: "ip", key: i.ip, limit: IP_LIMIT })
  const emailDecision = await consumeRateLimit(payload, { scope: "email", key: email, limit: EMAIL_LIMIT })
  if (!ipDecision.allowed || !emailDecision.allowed) {
    return { ok: false, error: { code: "CONFLICT", reason: RATE_LIMITED_REASON } }
  }
  void pruneRateLimits(payload).catch((error) => console.error("[identity] rate-limit prune failed", error))

  const customer = await upsertCustomerByEmail({ email, locale: i.locale })
  const token = newToken()
  await payload.create({
    collection: "magic-link-tokens",
    data: {
      customer: customer.id as number,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000).toISOString(),
      requestIp: i.ip,
      next: sanitizeNext(i.next),
    },
    overrideAccess: true,
  })

  try {
    await sendMagicLinkEmail({
      to: customer.email,
      locale: customer.preferredLocale,
      link: `${siteUrl()}/${customer.preferredLocale}/auth/verify?token=${encodeURIComponent(token)}`,
      expiresInMinutes: MAGIC_LINK_TTL_MINUTES,
    })
  } catch (error) {
    // Same 200 as success so the response never depends on the address; log for ops.
    console.error("[identity] magic-link email failed", error)
  }
  return { ok: true, data: undefined }
}

const invalid = (): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", issues: [{ path: "token", message: INVALID_TOKEN_MESSAGE }] },
})

type ConsumedToken = { customer: number; next: string | null }

/** Atomically burn an unused, unexpired token. One UPDATE, so replays lose the race. */
async function consumeToken(payload: Payload, tokenHash: string): Promise<ConsumedToken | null> {
  const table = payload.db.tables["magic_link_tokens"]
  const nowIso = new Date().toISOString()
  const rows = (await payload.db.drizzle
    .update(table)
    .set({ usedAt: nowIso })
    .where(and(eq(table.tokenHash, tokenHash), isNull(table.usedAt), gt(table.expiresAt, nowIso)))
    .returning({ customer: table.customer, next: table.next })) as ConsumedToken[]
  return rows[0] ?? null
}

/** Step 3: exchange a raw token for a session cookie. All failures look identical. */
export async function verifyMagicLink(
  token: string,
): Promise<Result<{ customerId: ID; setCookie: string; next: string }>> {
  const payload = await getPayload()
  const consumed = await consumeToken(payload, hashToken(token))
  if (!consumed) return invalid()

  const customer = await payload.findByID({
    collection: "customers",
    id: consumed.customer,
    depth: 0,
    overrideAccess: true,
  })
  const view = toCustomerView(customer)

  const collectionConfig = payload.collections["customers"].config
  const req = await createLocalReq({}, payload)
  const { sid } = await addSessionToUser({ collectionConfig, payload, req, user: customer })
  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: customer.email,
    sid,
    user: { ...customer, collection: "customers" },
  })
  const { token: jwt } = await jwtSign({
    fieldsToSign,
    secret: payload.secret,
    tokenExpiration: collectionConfig.auth.tokenExpiration,
  })
  const setCookie = generatePayloadCookie({
    collectionAuthConfig: collectionConfig.auth,
    cookiePrefix: payload.config.cookiePrefix,
    token: jwt,
  })

  const next = sanitizeNext(consumed.next) ?? `/${view.preferredLocale}/account`
  return { ok: true, data: { customerId: view.id, setCookie, next } }
}
