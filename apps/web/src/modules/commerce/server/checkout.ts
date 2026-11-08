import type Stripe from "stripe"

import type { ID, Locale, Result } from "@/modules/_shared"
import { getCourseCommerceRecord, getSessionView, getSiteSettings, type CourseCommerceRecord } from "@/modules/catalog"

import type { CheckoutMetadata, CheckoutResult, CreateCheckoutInput } from "../types"
import { allocateHold, attachCheckoutSession, releaseHold, type Allocation } from "./holds"
import { expireCheckoutSessions, getStripe } from "./stripe-port"
import {
  MSG,
  checkLineRules,
  checkoutInputSchema,
  isCartToken,
  moduleError,
  validationError,
  zodIssues,
  type ParsedLine,
} from "./validation"

/** Stripe minimum is 30 min; the DB hold (15 min) is the real limit (F1). */
export const CHECKOUT_TTL_SECONDS = 31 * 60

const notPurchasable = () => moduleError({ code: "CONFLICT", reason: "COURSE_NOT_PURCHASABLE" })
const notBookable = () => moduleError({ code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" })

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL is not set")
  return new URL(raw).origin
}

/** Translated, locale-prefixed return URLs (CONTRACT §5.2) via next-intl. */
export async function checkoutReturnUrls(locale: Locale): Promise<{ success: string; cancel: string }> {
  const { getPathname } = await import("@/i18n/navigation")
  const base = siteUrl()
  return {
    success: `${base}${getPathname({ locale, href: "/checkout/success" })}?session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}${getPathname({ locale, href: "/checkout/cancelled" })}`,
  }
}

type SessionParamsInput = {
  course: CourseCommerceRecord & { stripePriceId: string }
  line: ParsedLine
  locale: Locale
  customerEmail?: string
  cartToken: string
  holdId: number | null
  now: Date
}

/** Checkout params (W2-04 criteria). Guest names/emails are never sent to Stripe. */
export async function buildSessionParams(i: SessionParamsInput): Promise<Stripe.Checkout.SessionCreateParams> {
  const metadata: CheckoutMetadata = {
    cartToken: i.cartToken,
    ...(i.holdId !== null ? { holdId: String(i.holdId) } : {}),
    courseId: String(i.course.id),
    ...(i.line.sessionId !== undefined ? { sessionId: String(i.line.sessionId) } : {}),
    locale: i.locale,
    quantity: String(i.line.quantity),
  }
  const urls = await checkoutReturnUrls(i.locale)
  return {
    mode: "payment",
    line_items: [{ price: i.course.stripePriceId, quantity: i.line.quantity }],
    expires_at: Math.floor(i.now.getTime() / 1000) + CHECKOUT_TTL_SECONDS,
    locale: i.locale === "fr" ? "fr-CA" : "en",
    ...(i.customerEmail ? { customer_email: i.customerEmail } : {}),
    allow_promotion_codes: true,
    payment_method_types: ["card"],
    invoice_creation: { enabled: true, invoice_data: { metadata } },
    payment_intent_data: { metadata },
    ...(process.env.STRIPE_TAX_ENABLED === "true" ? { automatic_tax: { enabled: true } } : {}),
    success_url: urls.success,
    cancel_url: urls.cancel,
    metadata,
  }
}

async function validateSession(line: ParsedLine, courseId: ID, locale: Locale, now: Date): Promise<Result<void>> {
  const sessionId = line.sessionId as ID
  const view = await getSessionView(sessionId, locale)
  if (!view || Number(view.courseId) !== Number(courseId)) {
    return validationError([{ path: "lines.0.sessionId", message: MSG.SESSION_INVALID }])
  }
  if (view.status !== "scheduled" || new Date(view.startsAt).getTime() <= now.getTime()) return notBookable()
  return { ok: true, data: undefined }
}

async function openStripeSession(
  params: Stripe.Checkout.SessionCreateParams,
  holdId: number | null,
): Promise<Result<Stripe.Checkout.Session>> {
  try {
    const session = await getStripe().checkout.sessions.create(
      params,
      holdId !== null ? { idempotencyKey: `hold-${holdId}` } : undefined,
    )
    if (!session.url) throw new Error("Checkout session has no url")
    return { ok: true, data: session }
  } catch (error) {
    console.error("[commerce] checkout.sessions.create failed", { holdId, error })
    if (holdId !== null) await releaseHold(holdId)
    const message = error instanceof Error ? error.message : "stripe error"
    return moduleError({ code: "UPSTREAM", service: "stripe", message })
  }
}

/**
 * CONTRACT §4 createCheckout. Order: zod → course purchasable → D9 rules →
 * session bookable → locked allocation (no lock for invalid input) → commit →
 * expire the cart's previous Checkout sessions → Stripe Checkout (idempotency
 * `hold-<id>`) → write the session id back to the hold.
 */
export async function createCheckout(i: CreateCheckoutInput): Promise<Result<CheckoutResult>> {
  if (!isCartToken(i.cartToken)) return validationError([{ path: "cartToken", message: MSG.CART_TOKEN_INVALID }])
  const parsed = checkoutInputSchema.safeParse({ lines: i.cart, locale: i.locale, email: i.customerEmail })
  if (!parsed.success) return validationError(zodIssues(parsed.error))
  const input = parsed.data
  const line = input.lines[0] as ParsedLine

  const course = await getCourseCommerceRecord(line.courseId)
  if (!course || course.status !== "published" || !course.stripePriceId) return notPurchasable()
  const settings = await getSiteSettings()
  const issues = checkLineRules(input, course.format, settings.maxSeatsPerPurchase)
  if (issues.length > 0) return validationError(issues)

  const now = new Date()
  if (course.format === "in_person") {
    const ok = await validateSession(line, course.id, input.locale, now)
    if (!ok.ok) return ok
  }

  const alloc = await allocateHold({
    cartToken: i.cartToken,
    courseId: course.id,
    sessionId: course.format === "in_person" ? line.sessionId : undefined,
    quantity: line.quantity,
    customerEmail: input.email ?? null,
    attendees: line.attendees ?? [],
    holdMinutes: settings.holdMinutes,
    now,
  })
  if (!alloc.ok) return alloc
  return finishCheckout(alloc.data, { course: { ...course, stripePriceId: course.stripePriceId }, line, input, i, now })
}

async function finishCheckout(
  alloc: Allocation,
  c: {
    course: CourseCommerceRecord & { stripePriceId: string }
    line: ParsedLine
    input: { locale: Locale; email?: string }
    i: CreateCheckoutInput
    now: Date
  },
): Promise<Result<CheckoutResult>> {
  await expireCheckoutSessions(alloc.released.map((h) => h.stripeCheckoutSessionId))

  const params = await buildSessionParams({
    course: c.course,
    line: c.line,
    locale: c.input.locale,
    customerEmail: c.input.email,
    cartToken: c.i.cartToken,
    holdId: alloc.holdId,
    now: c.now,
  })
  const session = await openStripeSession(params, alloc.holdId)
  if (!session.ok) return session

  if (alloc.holdId !== null) {
    try {
      await attachCheckoutSession(alloc.holdId, session.data.id)
    } catch (error) {
      // Webhook resolves the hold via metadata.holdId; only cron expiry loses the link.
      console.error("[commerce] hold checkout-session write-back failed", { holdId: alloc.holdId, error })
    }
  }
  const holdExpiresAt = alloc.expiresAt ?? new Date((params.expires_at as number) * 1000)
  return {
    ok: true,
    data: {
      checkoutUrl: session.data.url as string,
      holdIds: alloc.holdId !== null ? [alloc.holdId] : [],
      holdExpiresAt: holdExpiresAt.toISOString(),
    },
  }
}
