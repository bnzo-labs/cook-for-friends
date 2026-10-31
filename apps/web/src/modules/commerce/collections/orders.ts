import type { CollectionConfig } from "payload"

import { locales } from "@/i18n/locales"
import { denyAll, isAdmin, ownsDocument } from "@/modules/identity"
import { salesGroup } from "../labels"
import { moneyField, validateInteger } from "../money"

/**
 * `orders` — created by the Stripe webhook only. CONTRACT §3.4.
 * `stripeCheckoutSessionId` UNIQUE (webhook idempotency, DISCOVERY R6).
 * Access §3.7: customer reads own; staff read; admin read + update.
 */
export const Orders: CollectionConfig = {
  slug: "orders",
  labels: {
    singular: { fr: "Commande", en: "Order" },
    plural: { fr: "Commandes", en: "Orders" },
  },
  admin: {
    useAsTitle: "number",
    defaultColumns: ["number", "email", "status", "total", "paidAt"],
    group: salesGroup,
  },
  access: {
    read: ownsDocument("customer"),
    create: denyAll,
    update: isAdmin,
    delete: denyAll,
  },
  fields: [
    {
      name: "number",
      type: "text",
      required: true,
      unique: true,
      index: true,
      label: { fr: "Numéro", en: "Number" },
      admin: { description: "CFF-000123" },
    },
    { name: "customer", type: "relationship", relationTo: "customers", index: true },
    { name: "email", type: "email", required: true, index: true },
    {
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "fr",
      options: locales.map((l) => ({ value: l, label: l === "fr" ? "Français" : "English" })),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: [
        { value: "pending", label: { fr: "En attente", en: "Pending" } },
        { value: "paid", label: { fr: "Payée", en: "Paid" } },
        { value: "refunded", label: { fr: "Remboursée", en: "Refunded" } },
        { value: "partially_refunded", label: { fr: "Partiellement remboursée", en: "Partially refunded" } },
        { value: "cancelled", label: { fr: "Annulée", en: "Cancelled" } },
      ],
    },
    {
      name: "items",
      type: "array",
      minRows: 1,
      fields: [
        { name: "course", type: "relationship", relationTo: "courses", required: true },
        { name: "session", type: "relationship", relationTo: "sessions" },
        {
          name: "quantity",
          type: "number",
          required: true,
          defaultValue: 1,
          min: 1,
          validate: (v: unknown) => validateInteger(1)(v),
        },
        moneyField({ name: "unitAmount", required: true }),
        { name: "description", type: "text" },
      ],
    },
    moneyField({ name: "subtotal", required: true, defaultValue: 0 }),
    moneyField({ name: "discountTotal", required: true, defaultValue: 0 }),
    moneyField({ name: "taxGst", required: true, defaultValue: 0 }),
    moneyField({ name: "taxQst", required: true, defaultValue: 0 }),
    moneyField({ name: "total", required: true, defaultValue: 0 }),
    {
      name: "currency",
      type: "select",
      required: true,
      defaultValue: "cad",
      options: [{ value: "cad", label: "CAD" }],
    },
    { name: "stripeCheckoutSessionId", type: "text", unique: true, index: true },
    { name: "stripePaymentIntentId", type: "text", index: true },
    { name: "stripeInvoiceId", type: "text" },
    { name: "invoicePdfUrl", type: "text" },
    { name: "promotionCode", type: "text" },
    { name: "paidAt", type: "date" },
    {
      name: "refunds",
      type: "array",
      fields: [
        { name: "stripeRefundId", type: "text", required: true },
        moneyField({ name: "amount", required: true }),
        { name: "reason", type: "text" },
        { name: "at", type: "date", required: true },
        { name: "enrollment", type: "relationship", relationTo: "enrollments", admin: { readOnly: true } },
      ],
    },
  ],
}
