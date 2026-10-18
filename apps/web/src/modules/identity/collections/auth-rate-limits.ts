import type { CollectionConfig } from "payload"

import { denyAll, isAdmin } from "../access"

/**
 * `auth-rate-limits` — one row per magic-link request, keyed by SHA-256 of the
 * email or IP. Postgres-backed because serverless instances share no memory.
 * Internal to the identity module; writes only via Local API (overrideAccess).
 */
export const AuthRateLimits: CollectionConfig = {
  slug: "auth-rate-limits",
  admin: { hidden: true, useAsTitle: "keyHash" },
  access: {
    read: isAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    {
      name: "scope",
      type: "select",
      required: true,
      options: [
        { label: "Email", value: "email" },
        { label: "IP", value: "ip" },
      ],
    },
    { name: "keyHash", type: "text", required: true },
  ],
  indexes: [{ fields: ["scope", "keyHash", "createdAt"] }],
}
