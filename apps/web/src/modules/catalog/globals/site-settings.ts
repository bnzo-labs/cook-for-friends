import type { GlobalConfig } from "payload"

import { allowAll, isAdmin } from "@/modules/identity"
import { settingsGroup } from "../fields/labels"
import { validateInteger } from "../fields/money"

/** Validates `reminderOffsetsHours`: positive integers. Exported for tests. */
export function validateReminderOffsets(value: unknown): true | string {
  if (value === null || value === undefined) return true
  if (!Array.isArray(value)) return "Liste d'heures requise / List of hours required"
  const ok = value.every((h) => typeof h === "number" && Number.isInteger(h) && h > 0)
  return ok ? true : "Heures entières > 0 / Hours must be integers > 0"
}

/** Validates `maxSeatsPerPurchase`: integer 1..10. Exported for tests. */
export function validateMaxSeats(value: unknown): true | string {
  const base = validateInteger(1)(value)
  if (base !== true) return base
  if (typeof value === "number" && value > 10) return "Doit être ≤ 10 / Must be ≤ 10"
  return true
}

/** `site-settings` — CONTRACT §3.1. Late-bound decisions D3, D9, D10. */
export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: { fr: "Réglages du site", en: "Site settings" },
  admin: { group: settingsGroup },
  access: {
    read: allowAll,
    update: isAdmin,
  },
  fields: [
    { name: "communityUrl", type: "text", label: { fr: "Lien communauté", en: "Community link" } },
    {
      name: "maxSeatsPerPurchase",
      type: "number",
      required: true,
      defaultValue: 4,
      min: 1,
      max: 10,
      label: { fr: "Places max. par achat", en: "Max seats per purchase" },
      admin: { description: { fr: "Max. places par achat (1–10)", en: "Max. seats per purchase (1–10)" } },
      validate: (v: unknown) => validateMaxSeats(v),
    },
    {
      name: "holdMinutes",
      type: "number",
      required: true,
      defaultValue: 15,
      min: 1,
      label: { fr: "Durée de réservation (min)", en: "Seat hold (minutes)" },
      validate: (v: unknown) => validateInteger(1)(v),
    },
    {
      name: "waitlistNotifyCount",
      type: "number",
      required: true,
      defaultValue: 3,
      min: 1,
      label: { fr: "Personnes notifiées (liste d'attente)", en: "Waitlist notify count" },
      validate: (v: unknown) => validateInteger(1)(v),
    },
    {
      name: "reminderOffsetsHours",
      type: "number",
      hasMany: true,
      defaultValue: [48, 24],
      label: { fr: "Rappels (heures avant)", en: "Reminders (hours before)" },
      validate: (v: unknown) => validateReminderOffsets(v),
    },
    { name: "contactEmail", type: "email", label: { fr: "Courriel de contact", en: "Contact email" } },
    {
      name: "legal",
      type: "group",
      label: { fr: "Pages légales", en: "Legal pages" },
      fields: [
        { name: "termsPage", type: "relationship", relationTo: "pages" },
        { name: "privacyPage", type: "relationship", relationTo: "pages" },
        { name: "cancellationPage", type: "relationship", relationTo: "pages" },
      ],
    },
  ],
}
