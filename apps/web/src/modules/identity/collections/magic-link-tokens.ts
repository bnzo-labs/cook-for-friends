import type { CollectionConfig } from "payload"

import { denyAll, isStaffOrAdmin } from "../access"

/**
 * `magic-link-tokens` — single-use login tokens. Only the SHA-256 hash is stored.
 * CONTRACT §3.2. Access §3.7: staff read; writes only via identity module (Local API).
 */
export const MagicLinkTokens: CollectionConfig = {
  slug: "magic-link-tokens",
  labels: {
    singular: { fr: "Jeton de connexion", en: "Magic-link token" },
    plural: { fr: "Jetons de connexion", en: "Magic-link tokens" },
  },
  admin: {
    hidden: true,
    useAsTitle: "tokenHash",
    group: { fr: "Paramètres", en: "Settings" },
  },
  access: {
    read: isStaffOrAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    { name: "customer", type: "relationship", relationTo: "customers", required: true, index: true },
    { name: "tokenHash", type: "text", required: true, unique: true, index: true },
    { name: "expiresAt", type: "date", required: true, index: true },
    { name: "usedAt", type: "date" },
    { name: "requestIp", type: "text", required: true },
    { name: "next", type: "text" },
  ],
}
