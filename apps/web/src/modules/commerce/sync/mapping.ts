import type Stripe from "stripe"

import type { CourseCommerceRecord } from "@/modules/catalog"

/** Pure param mapping + change detection for the Stripe catalog sync (W2-08). */

export const SYNC_CURRENCY = "cad" as const

export type ProductDesired = {
  name: string
  description: string | null
  metadata: Record<string, string>
  active: boolean
  taxCode: string | null
}

export function desiredProduct(rec: CourseCommerceRecord, taxCode: string | undefined): ProductDesired {
  return {
    name: rec.title.fr || rec.title.en || `Course ${rec.id}`,
    description: rec.summary.fr || null,
    metadata: {
      payloadCourseId: String(rec.id),
      title_en: rec.title.en ?? "",
      slug_fr: rec.slug.fr ?? "",
      slug_en: rec.slug.en ?? "",
    },
    active: rec.status !== "archived",
    taxCode: taxCode?.trim() ? taxCode.trim() : null,
  }
}

export function productCreateParams(d: ProductDesired): Stripe.ProductCreateParams {
  return {
    name: d.name,
    ...(d.description ? { description: d.description } : {}),
    metadata: d.metadata,
    active: d.active,
    ...(d.taxCode ? { tax_code: d.taxCode } : {}),
  }
}

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  v == null ? null : typeof v === "string" ? v : v.id

/**
 * Diff the desired Product against Stripe's. Returns only changed fields
 * (empty = no write). `defaultPriceId` is compared only when known.
 */
export function productUpdateParams(
  current: Stripe.Product,
  d: ProductDesired,
  defaultPriceId: string | null,
): Stripe.ProductUpdateParams {
  const out: Stripe.ProductUpdateParams = {}
  if (current.name !== d.name) out.name = d.name
  if ((current.description ?? null) !== d.description) out.description = d.description ?? ""
  if (current.active !== d.active) out.active = d.active
  const md = current.metadata ?? {}
  if (Object.entries(d.metadata).some(([k, v]) => md[k] !== v)) out.metadata = d.metadata
  if (d.taxCode && idOf(current.tax_code as string | { id: string } | null) !== d.taxCode) out.tax_code = d.taxCode
  if (defaultPriceId && idOf(current.default_price as string | { id: string } | null) !== defaultPriceId) {
    out.default_price = defaultPriceId
  }
  return out
}

export function priceMatches(price: Stripe.Price, amount: number): boolean {
  return (
    price.active &&
    price.unit_amount === amount &&
    price.currency === SYNC_CURRENCY &&
    price.tax_behavior === "exclusive"
  )
}

/** Only these changes of a published course need a Stripe round-trip. */
export type CourseSyncSnapshot = {
  status?: unknown
  _status?: unknown
  price?: unknown
  title?: unknown
  summary?: unknown
  slug?: unknown
}

export function courseNeedsSync(prev: CourseSyncSnapshot | null | undefined, next: CourseSyncSnapshot): boolean {
  if (next._status !== "published") return false // draft-only saves never sync
  if (!prev || prev._status !== "published") return true // publish
  return (["status", "price", "title", "summary", "slug"] as const).some((k) => prev[k] !== next[k])
}

export type DiscountSnapshot = {
  code?: unknown
  kind?: unknown
  value?: unknown
  maxRedemptions?: unknown
  expiresAt?: unknown
  appliesTo?: unknown
  active?: unknown
  personalFor?: unknown
  stripePromotionCodeId?: unknown
}

const relIds = (v: unknown): string =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(typeof x === "object" && x !== null ? (x as { id: unknown }).id : x))
    .sort()
    .join(",")

const norm = (v: unknown): string => (v == null ? "" : String(v))

export function discountNeedsSync(prev: DiscountSnapshot | null | undefined, next: DiscountSnapshot): boolean {
  if (next.personalFor) return false // W3 credits, out of scope
  if (!prev || !next.stripePromotionCodeId) return true
  const same =
    norm(prev.code) === norm(next.code) &&
    norm(prev.kind) === norm(next.kind) &&
    norm(prev.value) === norm(next.value) &&
    norm(prev.maxRedemptions) === norm(next.maxRedemptions) &&
    (prev.expiresAt ? new Date(String(prev.expiresAt)).getTime() : 0) ===
      (next.expiresAt ? new Date(String(next.expiresAt)).getTime() : 0) &&
    relIds(prev.appliesTo) === relIds(next.appliesTo) &&
    Boolean(prev.active) === Boolean(next.active)
  return !same
}

export type CouponDesired = {
  percentOff?: number
  amountOff?: number
  maxRedemptions?: number
  redeemBy?: number
  products?: string[]
}

export function couponCreateParams(d: CouponDesired, name: string): Stripe.CouponCreateParams {
  return {
    name,
    duration: "once",
    ...(d.percentOff !== undefined ? { percent_off: d.percentOff } : {}),
    ...(d.amountOff !== undefined ? { amount_off: d.amountOff, currency: SYNC_CURRENCY } : {}),
    ...(d.maxRedemptions !== undefined ? { max_redemptions: d.maxRedemptions } : {}),
    ...(d.redeemBy !== undefined ? { redeem_by: d.redeemBy } : {}),
    ...(d.products?.length ? { applies_to: { products: d.products } } : {}),
  }
}

export function couponMatches(c: Stripe.Coupon, d: CouponDesired): boolean {
  const have = [...(c.applies_to?.products ?? [])].sort().join(",")
  const want = [...(d.products ?? [])].sort().join(",")
  return (
    c.valid !== false &&
    (c.percent_off ?? undefined) === d.percentOff &&
    (c.amount_off ?? undefined) === d.amountOff &&
    (d.amountOff === undefined || c.currency === SYNC_CURRENCY) &&
    (c.max_redemptions ?? undefined) === d.maxRedemptions &&
    (c.redeem_by ?? undefined) === d.redeemBy &&
    have === want
  )
}
