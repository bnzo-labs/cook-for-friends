import type { CollectionConfig } from "payload"

import { denyAll, isStaffOrAdmin } from "@/modules/identity"
import { salesGroup } from "../labels"
import { validateInteger } from "../money"

/**
 * `seat-holds` — 15-minute seat reservations during checkout. CONTRACT §3.4.
 * Written only by commerce (raw SQL inside a row lock, DISCOVERY F3).
 * Index `(session, status, expiresAt)` backs the availability count (F2).
 */
export const SeatHolds: CollectionConfig = {
  slug: "seat-holds",
  labels: {
    singular: { fr: "Réservation de place", en: "Seat hold" },
    plural: { fr: "Réservations de places", en: "Seat holds" },
  },
  admin: {
    useAsTitle: "cartToken",
    defaultColumns: ["session", "quantity", "status", "expiresAt"],
    group: salesGroup,
  },
  access: {
    read: isStaffOrAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  indexes: [{ fields: ["session", "status", "expiresAt"] }],
  fields: [
    { name: "session", type: "relationship", relationTo: "sessions", required: true },
    {
      name: "quantity",
      type: "number",
      required: true,
      defaultValue: 1,
      min: 1,
      validate: (v: unknown) => validateInteger(1)(v),
    },
    { name: "cartToken", type: "text", required: true, index: true },
    { name: "customerEmail", type: "email" },
    { name: "stripeCheckoutSessionId", type: "text", index: true },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { value: "active", label: { fr: "Active", en: "Active" } },
        { value: "converted", label: { fr: "Convertie", en: "Converted" } },
        { value: "expired", label: { fr: "Expirée", en: "Expired" } },
        { value: "released", label: { fr: "Libérée", en: "Released" } },
      ],
    },
    { name: "expiresAt", type: "date", required: true },
  ],
}
