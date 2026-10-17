import type { CollectionConfig } from "payload"

import { denyAll, isStaffOrAdmin } from "@/modules/identity"
import { salesGroup } from "../labels"

/**
 * `processed-stripe-events` — webhook idempotency ledger. CONTRACT §3.4.
 * `eventId` UNIQUE, inserted in the same transaction as side effects (R6).
 */
export const ProcessedStripeEvents: CollectionConfig = {
  slug: "processed-stripe-events",
  labels: {
    singular: { fr: "Événement Stripe traité", en: "Processed Stripe event" },
    plural: { fr: "Événements Stripe traités", en: "Processed Stripe events" },
  },
  admin: {
    useAsTitle: "eventId",
    defaultColumns: ["eventId", "type", "outcome", "processedAt"],
    group: salesGroup,
  },
  access: {
    read: isStaffOrAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    { name: "eventId", type: "text", required: true, unique: true, index: true },
    { name: "type", type: "text", required: true },
    { name: "processedAt", type: "date", required: true },
    {
      name: "outcome",
      type: "select",
      required: true,
      options: [
        { value: "applied", label: "applied" },
        { value: "skipped", label: "skipped" },
        { value: "refunded", label: "refunded" },
        { value: "error", label: "error" },
      ],
    },
    { name: "note", type: "textarea" },
  ],
}
