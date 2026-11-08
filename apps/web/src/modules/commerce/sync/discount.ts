import { createHash } from "node:crypto"

import type Stripe from "stripe"

import type { ID, Result } from "@/modules/_shared"

import { getPayload } from "../server/payload"
import { getStripe } from "../server/stripe-port"
import { couponCreateParams, couponMatches, type CouponDesired } from "./mapping"

const isMissing = (e: unknown): boolean => (e as { code?: string } | null)?.code === "resource_missing"
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 500)
const idOf = (v: unknown): ID => (typeof v === "object" && v !== null ? (v as { id: ID }).id : (v as ID))

export type DiscountSyncOutcome =
  | { status: "skipped"; reason: string }
  | { status: "synced"; couponId: string; promotionCodeId: string; active: boolean }

async function writeBack(id: ID, data: { stripeCouponId: string; stripePromotionCodeId: string }): Promise<void> {
  const payload = await getPayload()
  await payload.update({
    collection: "discount-codes",
    id,
    data,
    context: { skipStripeSync: true },
    overrideAccess: true,
    depth: 0,
  })
}

/** Coupon + Promotion Code mirror of one `discount-codes` row (CONTRACT §5.3). */
export async function syncDiscountToStripe(discountCodeId: ID): Promise<Result<DiscountSyncOutcome>> {
  const payload = await getPayload()
  const doc = await payload
    .findByID({ collection: "discount-codes", id: discountCodeId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return { ok: false, error: { code: "NOT_FOUND", entity: "discount-code" } }
  if (doc.personalFor) {
    // Personal credits are W3 (issueCreditCode); nothing to mirror.
    return { ok: true, data: { status: "skipped", reason: "personalFor codes are synced by W3 credits" } }
  }

  const stripe = getStripe()
  try {
    const courseIds = ((doc.appliesTo ?? []) as unknown[]).map(idOf)
    const products: string[] = []
    for (const cid of courseIds) {
      const c = await payload.findByID({ collection: "courses", id: cid, depth: 0, overrideAccess: true })
      if (!c.stripeProductId) throw new Error(`course ${cid} has no Stripe product yet (sync it first)`)
      products.push(c.stripeProductId)
    }
    const desired: CouponDesired = {
      ...(doc.kind === "percent" ? { percentOff: doc.value } : { amountOff: doc.value }),
      ...(doc.maxRedemptions ? { maxRedemptions: doc.maxRedemptions } : {}),
      ...(doc.expiresAt ? { redeemBy: Math.floor(new Date(doc.expiresAt).getTime() / 1000) } : {}),
      ...(products.length ? { products } : {}),
    }
    const active = doc.active !== false

    // Reuse the stored Coupon when it still matches; Coupons are immutable.
    let coupon: Stripe.Coupon | null = null
    if (doc.stripeCouponId) {
      try {
        coupon = await stripe.coupons.retrieve(doc.stripeCouponId)
      } catch (e) {
        if (!isMissing(e)) throw e
      }
    }
    let promo: Stripe.PromotionCode | null = null
    if (doc.stripePromotionCodeId) {
      try {
        promo = await stripe.promotionCodes.retrieve(doc.stripePromotionCodeId)
      } catch (e) {
        if (!isMissing(e)) throw e
      }
    }

    const couponOk = coupon !== null && couponMatches(coupon, desired)
    const promoCouponId = promo ? (typeof promo.promotion.coupon === "string" ? promo.promotion.coupon : promo.promotion.coupon?.id) : null
    const promoReusable = couponOk && promo !== null && promo.code === doc.code && promoCouponId === coupon?.id

    if (promoReusable && promo) {
      if (promo.active !== active) await stripe.promotionCodes.update(promo.id, { active })
      return { ok: true, data: { status: "synced", couponId: coupon!.id, promotionCodeId: promo.id, active } }
    }

    // Replace: free the code string first (unique among active promotion codes).
    if (promo?.active) await stripe.promotionCodes.update(promo.id, { active: false })

    if (!couponOk) {
      const params = couponCreateParams(desired, doc.code)
      const key = createHash("sha256")
        .update(JSON.stringify([doc.id, doc.code, params, doc.stripeCouponId ?? ""]))
        .digest("hex")
        .slice(0, 32)
      coupon = await stripe.coupons.create(params, { idempotencyKey: `discount-${doc.id}-coupon-${key}` })
    }
    const couponId = coupon!.id
    const created = await stripe.promotionCodes.create(
      {
        promotion: { type: "coupon", coupon: couponId },
        code: doc.code,
        active,
        metadata: { payloadDiscountCodeId: String(doc.id) },
      },
      { idempotencyKey: `discount-${doc.id}-promo-${couponId}-${doc.code}` },
    )
    await writeBack(doc.id, { stripeCouponId: couponId, stripePromotionCodeId: created.id })
    return { ok: true, data: { status: "synced", couponId, promotionCodeId: created.id, active } }
  } catch (error) {
    console.error("[commerce.sync] discount sync failed", { discountCodeId, error })
    return { ok: false, error: { code: "UPSTREAM", service: "stripe", message: message(error) } }
  }
}
