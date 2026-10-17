import type { GlobalConfig } from "payload"

import { allowAll, isAdmin } from "@/modules/identity"
import { settingsGroup } from "../fields/labels"

type Tier = { minHoursBefore?: unknown; outcome?: unknown; percent?: unknown }

/** Tiers must be sorted by `minHoursBefore` descending, unique. Exported for tests. */
export function validateTiers(value: unknown): true | string {
  if (value === null || value === undefined) return true
  if (!Array.isArray(value)) return "Paliers invalides / Invalid tiers"
  const hours = (value as Tier[]).map((t) => t?.minHoursBefore)
  if (!hours.every((h) => typeof h === "number")) return true // per-field `required` reports this
  for (let i = 1; i < hours.length; i++) {
    if ((hours[i] as number) >= (hours[i - 1] as number)) {
      return "Paliers triés par heures décroissantes, sans doublon / Tiers must be sorted by hours, descending, no duplicates"
    }
  }
  return true
}

/** `cancellation-policy` — CONTRACT §3.1. Decision D1 stays configurable. */
export const CancellationPolicy: GlobalConfig = {
  slug: "cancellation-policy",
  label: { fr: "Politique d'annulation", en: "Cancellation policy" },
  admin: { group: settingsGroup },
  access: {
    read: allowAll,
    update: isAdmin,
  },
  fields: [
    {
      name: "tiers",
      type: "array",
      label: { fr: "Paliers", en: "Tiers" },
      validate: (v: unknown) => validateTiers(v),
      fields: [
        {
          name: "minHoursBefore",
          type: "number",
          required: true,
          min: 0,
          label: { fr: "Heures minimum avant la séance", en: "Min. hours before session" },
        },
        {
          name: "outcome",
          type: "select",
          required: true,
          label: { fr: "Résultat", en: "Outcome" },
          options: [
            { value: "refund", label: { fr: "Remboursement", en: "Refund" } },
            { value: "credit", label: { fr: "Crédit", en: "Credit" } },
            { value: "none", label: { fr: "Aucun", en: "None" } },
          ],
        },
        {
          name: "percent",
          type: "number",
          required: true,
          min: 0,
          max: 100,
          label: { fr: "Pourcentage", en: "Percent" },
        },
      ],
    },
    {
      name: "customerCanSelfCancel",
      type: "checkbox",
      defaultValue: true,
      label: { fr: "Le client peut annuler lui-même", en: "Customer can self-cancel" },
    },
  ],
}
