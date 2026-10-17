import type { CollectionConfig, Validate } from "payload"

import { isAdmin, isStaffOrAdmin } from "@/modules/identity"
import { salesGroup } from "../labels"
import { validateInteger } from "../money"

/**
 * `discount-codes` — synced one-way to Stripe Coupons/Promotion Codes (W2).
 * CONTRACT §3.4. `value` = percent (1–100) or amount in cents depending on `kind`.
 */
export function validateDiscountValue(
  value: unknown,
  { siblingData }: { siblingData: { kind?: unknown } },
): true | string {
  const base = validateInteger(0)(value)
  if (base !== true) return base
  if (siblingData?.kind === "percent" && typeof value === "number" && (value < 1 || value > 100)) {
    return "Pourcentage entre 1 et 100 / Percent must be 1–100"
  }
  return true
}

export const DiscountCodes: CollectionConfig = {
  slug: "discount-codes",
  labels: {
    singular: { fr: "Code promo", en: "Discount code" },
    plural: { fr: "Codes promo", en: "Discount codes" },
  },
  admin: {
    useAsTitle: "code",
    defaultColumns: ["code", "kind", "value", "active", "expiresAt"],
    group: salesGroup,
  },
  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: "code", type: "text", required: true, unique: true, index: true },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        { value: "percent", label: { fr: "Pourcentage", en: "Percent" } },
        { value: "amount", label: { fr: "Montant (cents)", en: "Amount (cents)" } },
      ],
    },
    {
      name: "value",
      type: "number",
      required: true,
      min: 0,
      admin: { description: { fr: "Pourcentage (1–100) ou montant en cents", en: "Percent (1–100) or amount in cents" } },
      validate: ((v, { siblingData }) =>
        validateDiscountValue(v, { siblingData: siblingData as { kind?: unknown } })) as Validate,
    },
    { name: "maxRedemptions", type: "number", min: 1, validate: (v: unknown) => validateInteger(1)(v) },
    { name: "expiresAt", type: "date" },
    { name: "appliesTo", type: "relationship", relationTo: "courses", hasMany: true },
    { name: "active", type: "checkbox", defaultValue: true },
    { name: "stripeCouponId", type: "text", admin: { readOnly: true, position: "sidebar" } },
    { name: "stripePromotionCodeId", type: "text", admin: { readOnly: true, position: "sidebar" } },
    {
      name: "personalFor",
      type: "relationship",
      relationTo: "customers",
      admin: { description: { fr: "Crédit personnel (usage unique)", en: "Personal credit (single use)" } },
    },
  ],
}
