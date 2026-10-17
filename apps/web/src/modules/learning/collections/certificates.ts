import type { CollectionConfig } from "payload"

import { locales } from "@/i18n/locales"
import { isAdmin, ownsDocument } from "@/modules/identity"
import { learningGroup } from "../labels"

/** 10 chars, Crockford base32 alphabet (no I, L, O, U). */
export const VERIFICATION_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/

export function validateVerificationCode(value: unknown): true | string {
  if (typeof value !== "string" || !VERIFICATION_CODE_RE.test(value)) {
    return "Code: 10 caractères base32 Crockford / Code: 10 Crockford base32 chars"
  }
  return true
}

/**
 * `certificates` — completion certificates. CONTRACT §3.6.
 * `verificationCode` UNIQUE, UNIQUE `(customer, course)`.
 */
export const Certificates: CollectionConfig = {
  slug: "certificates",
  labels: {
    singular: { fr: "Certificat", en: "Certificate" },
    plural: { fr: "Certificats", en: "Certificates" },
  },
  admin: {
    useAsTitle: "verificationCode",
    defaultColumns: ["verificationCode", "customer", "course", "issuedAt"],
    group: learningGroup,
  },
  access: {
    read: ownsDocument("customer"),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ["customer", "course"], unique: true }],
  fields: [
    { name: "customer", type: "relationship", relationTo: "customers", required: true },
    { name: "course", type: "relationship", relationTo: "courses", required: true },
    {
      name: "verificationCode",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: (v: unknown) => validateVerificationCode(v),
    },
    { name: "issuedAt", type: "date", required: true },
    {
      name: "locale",
      type: "select",
      required: true,
      defaultValue: "fr",
      options: locales.map((l) => ({ value: l, label: l === "fr" ? "Français" : "English" })),
    },
    { name: "customerNameSnapshot", type: "text", required: true },
    {
      name: "courseTitleSnapshot",
      type: "group",
      fields: [
        { name: "fr", type: "text", required: true },
        { name: "en", type: "text", required: true },
      ],
    },
  ],
}
