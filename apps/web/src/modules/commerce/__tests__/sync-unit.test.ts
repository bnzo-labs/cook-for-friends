import { describe, expect, it } from "vitest"
import type Stripe from "stripe"

import type { CourseCommerceRecord } from "@/modules/catalog"

import {
  couponCreateParams,
  couponMatches,
  courseNeedsSync,
  desiredProduct,
  discountNeedsSync,
  priceMatches,
  productCreateParams,
  productUpdateParams,
} from "../sync/mapping"

const rec: CourseCommerceRecord = {
  id: 7,
  format: "in_person",
  status: "published",
  price: 9500,
  title: { fr: "Pâtes fraîches", en: "Fresh pasta" },
  summary: { fr: "Résumé", en: "Summary" },
  slug: { fr: "pates-fraiches", en: "fresh-pasta" },
  stripeProductId: null,
  stripePriceId: null,
  stripeSyncStatus: "pending",
}

describe("product mapping", () => {
  it("maps FR name/description and EN metadata", () => {
    const p = productCreateParams(desiredProduct(rec, "txcd_20030000"))
    expect(p).toMatchObject({
      name: "Pâtes fraîches",
      description: "Résumé",
      active: true,
      tax_code: "txcd_20030000",
      metadata: { payloadCourseId: "7", title_en: "Fresh pasta", slug_fr: "pates-fraiches", slug_en: "fresh-pasta" },
    })
  })
  it("omits tax_code when unset; archived => inactive", () => {
    const d = desiredProduct({ ...rec, status: "archived" }, undefined)
    expect(productCreateParams(d)).not.toHaveProperty("tax_code")
    expect(d.active).toBe(false)
  })
  it("diff is empty when Stripe matches", () => {
    const d = desiredProduct(rec, undefined)
    const cur = { name: d.name, description: d.description, active: true, metadata: d.metadata, default_price: "price_1", tax_code: null } as unknown as Stripe.Product
    expect(productUpdateParams(cur, d, "price_1")).toEqual({})
    expect(productUpdateParams(cur, d, "price_2")).toEqual({ default_price: "price_2" })
    expect(productUpdateParams({ ...cur, name: "x" } as Stripe.Product, d, "price_1")).toEqual({ name: d.name })
  })
  it("priceMatches checks amount, currency, tax behavior, active", () => {
    const base = { active: true, unit_amount: 9500, currency: "cad", tax_behavior: "exclusive" } as Stripe.Price
    expect(priceMatches(base, 9500)).toBe(true)
    expect(priceMatches(base, 9600)).toBe(false)
    expect(priceMatches({ ...base, active: false }, 9500)).toBe(false)
    expect(priceMatches({ ...base, tax_behavior: "unspecified" }, 9500)).toBe(false)
  })
})

describe("change detection", () => {
  const pub = { _status: "published", status: "published", price: 100, title: "a", summary: "s", slug: "x" }
  it("draft-only saves never sync", () => expect(courseNeedsSync(pub, { ...pub, _status: "draft", price: 5 })).toBe(false))
  it("publish syncs", () => expect(courseNeedsSync({ ...pub, _status: "draft" }, pub)).toBe(true))
  it("price/title/status change syncs", () => {
    expect(courseNeedsSync(pub, { ...pub, price: 200 })).toBe(true)
    expect(courseNeedsSync(pub, { ...pub, title: "b" })).toBe(true)
    expect(courseNeedsSync(pub, { ...pub, status: "archived" })).toBe(true)
  })
  it("unrelated change does not", () => expect(courseNeedsSync(pub, { ...pub })).toBe(false))

  const d = { code: "A", kind: "percent", value: 10, active: true, stripePromotionCodeId: "promo_1", appliesTo: [1, 2] }
  it("discount: unchanged => no sync; value/active/appliesTo change => sync", () => {
    expect(discountNeedsSync(d, { ...d, appliesTo: [{ id: 2 }, { id: 1 }] })).toBe(false)
    expect(discountNeedsSync(d, { ...d, value: 20 })).toBe(true)
    expect(discountNeedsSync(d, { ...d, active: false })).toBe(true)
    expect(discountNeedsSync(d, { ...d, appliesTo: [1] })).toBe(true)
    expect(discountNeedsSync(null, { ...d, stripePromotionCodeId: null })).toBe(true)
  })
  it("discount: personalFor skipped", () => expect(discountNeedsSync(null, { ...d, personalFor: 3 })).toBe(false))
})

describe("coupon mapping", () => {
  it("percent coupon", () => {
    expect(couponCreateParams({ percentOff: 15, maxRedemptions: 5, redeemBy: 99, products: ["prod_1"] }, "SPRING")).toEqual({
      name: "SPRING",
      duration: "once",
      percent_off: 15,
      max_redemptions: 5,
      redeem_by: 99,
      applies_to: { products: ["prod_1"] },
    })
  })
  it("amount coupon uses cad", () => {
    expect(couponCreateParams({ amountOff: 1000 }, "X")).toMatchObject({ amount_off: 1000, currency: "cad" })
  })
  it("couponMatches detects drift", () => {
    const c = { valid: true, percent_off: 15, amount_off: null, max_redemptions: null, redeem_by: null, applies_to: undefined } as unknown as Stripe.Coupon
    expect(couponMatches(c, { percentOff: 15 })).toBe(true)
    expect(couponMatches(c, { percentOff: 20 })).toBe(false)
    expect(couponMatches(c, { percentOff: 15, products: ["p"] })).toBe(false)
  })
})
