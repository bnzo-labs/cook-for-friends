import type Stripe from "stripe"

import type { ID, Result } from "@/modules/_shared"
import { getCourseCommerceRecord, recordCourseStripeSync } from "@/modules/catalog"

import { getStripe } from "../server/stripe-port"
import { desiredProduct, priceMatches, productCreateParams, productUpdateParams, SYNC_CURRENCY } from "./mapping"

const isMissing = (e: unknown): boolean => (e as { code?: string } | null)?.code === "resource_missing"

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 500)

/**
 * One-way sync of a published course to Stripe (CONTRACT §4/§5.3).
 * Idempotent: an unchanged course performs reads only, zero writes.
 * The outcome is written back via `catalog.recordCourseStripeSync`.
 */
export async function syncCourseToStripe(courseId: ID): Promise<Result<{ productId: string; priceId: string }>> {
  const rec = await getCourseCommerceRecord(courseId)
  if (!rec) return { ok: false, error: { code: "NOT_FOUND", entity: "course" } }

  const stripe = getStripe()
  const want = desiredProduct(rec, process.env.STRIPE_TAX_CODE)

  try {
    let product: Stripe.Product | null = null
    if (rec.stripeProductId) {
      try {
        product = await stripe.products.retrieve(rec.stripeProductId)
      } catch (e) {
        if (!isMissing(e)) throw e
      }
    }

    if (!product) {
      // Ids can be lost when an editor saves a stale admin form; recover the
      // product by its metadata before creating a duplicate.
      const found = await stripe.products.search({
        query: `metadata['payloadCourseId']:'${rec.id}'`,
        limit: 1,
      })
      product = found.data[0] ?? null
    }

    if (!product) {
      if (!want.active) {
        // Archived and never synced: nothing to mirror.
        await recordCourseStripeSync(courseId, { status: "synced" })
        return { ok: false, error: { code: "CONFLICT", reason: "archived course was never synced" } }
      }
      product = await stripe.products.create(productCreateParams(want), {
        idempotencyKey: `course-${rec.id}-product`,
      })
    }

    // Price: archived courses keep their last price untouched.
    let price: Stripe.Price | null = null
    const knownPriceId =
      rec.stripePriceId ??
      (typeof product.default_price === "string" ? product.default_price : (product.default_price?.id ?? null))
    if (knownPriceId) {
      try {
        price = await stripe.prices.retrieve(knownPriceId)
      } catch (e) {
        if (!isMissing(e)) throw e
      }
    }
    let priceId = price?.id ?? ""
    let oldPriceToArchive: string | null = null
    if (want.active && (!price || !priceMatches(price, rec.price))) {
      const created = await stripe.prices.create(
        {
          product: product.id,
          currency: SYNC_CURRENCY,
          unit_amount: rec.price,
          tax_behavior: "exclusive",
          metadata: { payloadCourseId: String(rec.id) },
        },
        { idempotencyKey: `course-${rec.id}-price-${rec.price}-after-${price?.id ?? "none"}` },
      )
      if (price?.active) oldPriceToArchive = price.id
      priceId = created.id
    }

    const patch = productUpdateParams(product, want, want.active ? priceId : null)
    if (Object.keys(patch).length > 0) await stripe.products.update(product.id, patch)
    // Archive only after default_price moved (Stripe refuses to archive a default price).
    if (oldPriceToArchive) await stripe.prices.update(oldPriceToArchive, { active: false })

    await recordCourseStripeSync(courseId, { status: "synced", productId: product.id, priceId })
    return { ok: true, data: { productId: product.id, priceId } }
  } catch (error) {
    const msg = message(error)
    console.error("[commerce.sync] course sync failed", { courseId, error })
    await recordCourseStripeSync(courseId, { status: "error", error: msg })
    return { ok: false, error: { code: "UPSTREAM", service: "stripe", message: msg } }
  }
}
