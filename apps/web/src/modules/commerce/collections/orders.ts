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
    { name: "customer", type: "relationship", relationTo: "customers", index: true, label: { fr: "Client (acheteur)", en: "Customer (buyer)" } },
    { name: "email", type: "email", required: true, index: true, label: { fr: "Courriel", en: "Email" } },
    {
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "fr",
      label: { fr: "Langue", en: "Language" },
      options: locales.map((l) => ({ value: l, label: l === "fr" ? "Français" : "English" })),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      label: { fr: "Statut", en: "Status" },
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
      label: { fr: "Articles", en: "Items" },
      fields: [
        { name: "course", type: "relationship", relationTo: "courses", required: true, label: { fr: "Cours", en: "Course" } },
        { name: "session", type: "relationship", relationTo: "sessions", label: { fr: "Séance", en: "Session" } },
        {
          name: "quantity",
          type: "number",
          required: true,
          defaultValue: 1,
          min: 1,
          label: { fr: "Quantité (places)", en: "Quantity (seats)" },
          validate: (v: unknown) => validateInteger(1)(v),
        },
        moneyField({ name: "unitAmount", required: true, label: { fr: "Prix unitaire", en: "Unit amount" } }),
        { name: "description", type: "text", label: { fr: "Description", en: "Description" } },
      ],
    },
    moneyField({ name: "subtotal", required: true, defaultValue: 0, label: { fr: "Sous-total", en: "Subtotal" } }),
    moneyField({ name: "discountTotal", required: true, defaultValue: 0, label: { fr: "Rabais", en: "Discount" } }),
    moneyField({ name: "taxGst", required: true, defaultValue: 0, label: { fr: "TPS", en: "GST" } }),
    moneyField({ name: "taxQst", required: true, defaultValue: 0, label: { fr: "TVQ", en: "QST" } }),
    moneyField({ name: "total", required: true, defaultValue: 0, label: { fr: "Total", en: "Total" } }),
    {
      name: "currency",
      type: "select",
      required: true,
      defaultValue: "cad",
      label: { fr: "Devise", en: "Currency" },
      options: [{ value: "cad", label: "CAD" }],
    },
    { name: "stripeCheckoutSessionId", type: "text", unique: true, index: true, label: { fr: "Stripe : session de paiement", en: "Stripe Checkout session" } },
    { name: "stripePaymentIntentId", type: "text", index: true, label: { fr: "Stripe : paiement", en: "Stripe payment intent" } },
    { name: "stripeInvoiceId", type: "text", label: { fr: "Stripe : facture", en: "Stripe invoice" } },
    { name: "invoicePdfUrl", type: "text", label: { fr: "Lien du reçu (PDF)", en: "Receipt link (PDF)" } },
    { name: "promotionCode", type: "text", label: { fr: "Code promo utilisé", en: "Promotion code" } },
    { name: "paidAt", type: "date", label: { fr: "Payée le", en: "Paid at" } },
    {
      name: "refunds",
      type: "array",
      label: { fr: "Remboursements", en: "Refunds" },
      fields: [
        { name: "stripeRefundId", type: "text", required: true, label: { fr: "Stripe : remboursement", en: "Stripe refund" } },
        moneyField({ name: "amount", required: true, label: { fr: "Montant", en: "Amount" } }),
        { name: "reason", type: "text", label: { fr: "Motif", en: "Reason" } },
        { name: "at", type: "date", required: true, label: { fr: "Date", en: "Date" } },
        {
          name: "enrollment",
          type: "relationship",
          relationTo: "enrollments",
          label: { fr: "Place (inscription)", en: "Seat (enrollment)" },
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
