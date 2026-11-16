import type { CollectionAfterChangeHook, CollectionBeforeValidateHook, CollectionConfig, Validate } from "payload"

import { isAdmin, isStaffOrAdmin } from "@/modules/identity"
import { salesGroup } from "../labels"
import { applyDollarMirror, dollarsField, validateInteger } from "../money"
import { discountNeedsSync } from "../sync/mapping"

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

/** Queue `stripe-sync-discount` (W2-08) when Stripe-relevant fields change. */
export const enqueueDiscountSync: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context, operation }) => {
  if (context?.skipStripeSync) return doc
  if (!discountNeedsSync(operation === "create" ? null : previousDoc, doc)) return doc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (req.payload.jobs.queue as any)({ task: "stripe-sync-discount", input: { discountCodeId: doc.id }, req })
  return doc
}

const isAmount = (sibling: { kind?: unknown }) => sibling?.kind === "amount"
const isPercent = (sibling: { kind?: unknown }) => sibling?.kind === "percent"

/**
 * W4-07: staff type `percentValue` (percent) or `amountDollars` (amount, in dollars); both are
 * virtual. The stored `value` (percent, or cents) is derived here; an API write of `value`
 * alone still works. Mirror values equal to the stored value never override it.
 */
export const valueFromDollars: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data
  const kind = data.kind ?? originalDoc?.kind
  const { amountDollars, percentValue, ...rest } = data
  if (kind === "amount") return applyDollarMirror({ ...rest, amountDollars }, originalDoc, [["amountDollars", "value"]])
  if (kind === "percent" && typeof percentValue === "number" && percentValue !== originalDoc?.value) return { ...rest, value: percentValue }
  return rest
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
  hooks: { beforeValidate: [valueFromDollars], afterChange: [enqueueDiscountSync] },
  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: "code", type: "text", required: true, unique: true, index: true, label: { fr: "Code", en: "Code" } },
    {
      name: "kind",
      type: "select",
      required: true,
      label: { fr: "Type", en: "Kind" },
      options: [
        { value: "percent", label: { fr: "Pourcentage", en: "Percent" } },
        { value: "amount", label: { fr: "Montant ($)", en: "Amount ($)" } },
      ],
    },
    {
      // Stored value: percent (1–100) or amount in cents. Never typed directly in the admin:
      // staff use `percentValue` or `amountDollars` (virtual) below; filled in `beforeValidate`.
      // Not conditional (an admin.condition would make the column nullable).
      name: "value",
      type: "number",
      required: true,
      min: 0,
      label: { fr: "Valeur enregistrée (% ou cents)", en: "Stored value (% or cents)" },
      admin: { hidden: true },
      validate: ((v, { siblingData }) =>
        validateDiscountValue(v, { siblingData: siblingData as { kind?: unknown } })) as Validate,
    },
    {
      name: "percentValue",
      type: "number",
      virtual: true,
      min: 1,
      max: 100,
      label: { fr: "Pourcentage", en: "Percent" },
      admin: { description: { fr: "De 1 à 100", en: "From 1 to 100" }, condition: (_data, sibling) => isPercent(sibling ?? {}) },
      hooks: {
        afterRead: [({ siblingData }) => (isPercent(siblingData ?? {}) && typeof siblingData?.value === "number" ? siblingData.value : null)],
      },
    },
    dollarsField({
      name: "amountDollars",
      cents: "value",
      required: true,
      when: isAmount,
      label: { fr: "Montant en dollars", en: "Amount in dollars" },
      description: { fr: "Rabais en dollars canadiens. Ex. : 5 ou 12,50", en: "Discount in Canadian dollars. E.g. 5 or 12.50" },
    }),
    {
      name: "maxRedemptions",
      type: "number",
      min: 1,
      label: { fr: "Nombre d’utilisations max.", en: "Max redemptions" },
      admin: { description: { fr: "Vide = illimité", en: "Empty = unlimited" } },
      validate: (v: unknown) => validateInteger(1)(v),
    },
    { name: "expiresAt", type: "date", label: { fr: "Expire le", en: "Expires at" } },
    {
      name: "appliesTo",
      type: "relationship",
      relationTo: "courses",
      hasMany: true,
      label: { fr: "Cours visés", en: "Applies to courses" },
      admin: { description: { fr: "Vide = tous les cours", en: "Empty = every course" } },
    },
    { name: "active", type: "checkbox", defaultValue: true, label: { fr: "Actif", en: "Active" } },
    {
      name: "stripeCouponId",
      type: "text",
      label: { fr: "Stripe : coupon", en: "Stripe coupon" },
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripePromotionCodeId",
      type: "text",
      label: { fr: "Stripe : code promotionnel", en: "Stripe promotion code" },
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "personalFor",
      type: "relationship",
      relationTo: "customers",
      label: { fr: "Réservé au client", en: "Personal for" },
      admin: { description: { fr: "Crédit personnel (usage unique)", en: "Personal credit (single use)" } },
    },
  ],
}
