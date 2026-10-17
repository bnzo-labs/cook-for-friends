import type { CollectionConfig } from "payload"

import { locales } from "@/i18n/locales"
import { isAdmin, isStaffOrAdmin } from "@/modules/identity"

/**
 * `waitlist-entries` — FIFO waitlist per session. CONTRACT §3.5.
 * UNIQUE `(session, email)`. Emails are stored lower-cased so the unique key
 * cannot be bypassed by case.
 */
export const WaitlistEntries: CollectionConfig = {
  slug: "waitlist-entries",
  labels: {
    singular: { fr: "Inscription en liste d'attente", en: "Waitlist entry" },
    plural: { fr: "Liste d'attente", en: "Waitlist" },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["session", "email", "status", "createdAt"],
    group: { fr: "Clients", en: "Customers" },
  },
  access: {
    read: isStaffOrAdmin,
    create: isAdmin,
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ["session", "email"], unique: true }],
  fields: [
    { name: "session", type: "relationship", relationTo: "sessions", required: true },
    { name: "customer", type: "relationship", relationTo: "customers" },
    {
      name: "email",
      type: "email",
      required: true,
      hooks: {
        beforeValidate: [({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value)],
      },
    },
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
      defaultValue: "waiting",
      index: true,
      options: [
        { value: "waiting", label: { fr: "En attente", en: "Waiting" } },
        { value: "notified", label: { fr: "Notifié", en: "Notified" } },
        { value: "converted", label: { fr: "Converti", en: "Converted" } },
        { value: "expired", label: { fr: "Expiré", en: "Expired" } },
        { value: "removed", label: { fr: "Retiré", en: "Removed" } },
      ],
    },
    { name: "notifiedAt", type: "date" },
  ],
}
