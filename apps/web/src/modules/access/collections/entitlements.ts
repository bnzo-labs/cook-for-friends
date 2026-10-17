import type { CollectionConfig } from "payload"

import { isAdmin, isAdminUser, isStaff, ownsDocument } from "@/modules/identity"

/**
 * `entitlements` — the only gate for course access (MASTER_BUILD_SPEC §4.1).
 * CONTRACT §3.3. UNIQUE `(customer, course, source, sourceRef)`.
 * Access §3.7: customer reads own; staff read + create `manual`; admin CRUD.
 */
export const Entitlements: CollectionConfig = {
  slug: "entitlements",
  labels: {
    singular: { fr: "Droit d'accès", en: "Entitlement" },
    plural: { fr: "Droits d'accès", en: "Entitlements" },
  },
  admin: {
    useAsTitle: "sourceRef",
    defaultColumns: ["customer", "course", "source", "validFrom", "validUntil", "revokedAt"],
    group: { fr: "Clients", en: "Customers" },
  },
  access: {
    read: ownsDocument("customer"),
    create: ({ req, data }) => {
      if (isAdminUser(req.user)) return true
      return isStaff(req.user) && data?.source === "manual"
    },
    update: isAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ["customer", "course", "source", "sourceRef"], unique: true }],
  fields: [
    { name: "customer", type: "relationship", relationTo: "customers", required: true, index: true },
    { name: "course", type: "relationship", relationTo: "courses", required: true, index: true },
    {
      name: "source",
      type: "select",
      required: true,
      options: [
        { value: "purchase", label: { fr: "Achat", en: "Purchase" } },
        { value: "gift", label: { fr: "Cadeau", en: "Gift" } },
        { value: "manual", label: { fr: "Manuel", en: "Manual" } },
        { value: "membership", label: { fr: "Abonnement", en: "Membership" } },
      ],
    },
    {
      name: "sourceRef",
      type: "text",
      required: true,
      admin: { description: { fr: "ID de commande, d'utilisateur, de cadeau ou d'abonnement", en: "Order, user, gift or membership ID" } },
    },
    { name: "validFrom", type: "date", required: true, defaultValue: () => new Date().toISOString() },
    {
      name: "validUntil",
      type: "date",
      admin: { description: { fr: "Vide = sans expiration", en: "Empty = no expiry" } },
    },
    { name: "revokedAt", type: "date" },
    { name: "revokedReason", type: "text" },
    { name: "grantedBy", type: "relationship", relationTo: "users" },
  ],
}
