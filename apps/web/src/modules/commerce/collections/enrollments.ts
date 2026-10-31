import type { CollectionConfig, Field, FieldAccess } from "payload"

import { isAdmin, isAdminField, isStaffOrAdmin, ownsDocument } from "@/modules/identity"
import { salesGroup } from "../labels"
import { moneyField, validateInteger } from "../money"

/** Staff may update only `attendance`; every other field is admin-only on update. */
const adminUpdateOnly: { update: FieldAccess } = { update: isAdminField }

const fields: Field[] = [
  { name: "session", type: "relationship", relationTo: "sessions", required: true, index: true, access: adminUpdateOnly },
  { name: "customer", type: "relationship", relationTo: "customers", required: true, index: true, access: adminUpdateOnly },
  { name: "order", type: "relationship", relationTo: "orders", required: true, access: adminUpdateOnly },
  {
    name: "attendeeIndex",
    type: "number",
    required: true,
    defaultValue: 0,
    min: 0,
    validate: (v: unknown) => validateInteger(0)(v),
    access: adminUpdateOnly,
  },
  { name: "attendeeName", type: "text", access: adminUpdateOnly },
  /**
   * This seat's share of `order.total` in cents (incl. tax and discount):
   * `floor(total / N)`, remainder cents on attendeeIndex 0; sum = order.total.
   * Basis for per-seat partial refund/credit (CONTRACT §3.4, D1).
   */
  moneyField({ name: "seatAmount", access: adminUpdateOnly }),
  {
    name: "status",
    type: "select",
    required: true,
    defaultValue: "confirmed",
    index: true,
    access: adminUpdateOnly,
    options: [
      { value: "confirmed", label: { fr: "Confirmée", en: "Confirmed" } },
      { value: "cancelled", label: { fr: "Annulée", en: "Cancelled" } },
      { value: "refunded", label: { fr: "Remboursée", en: "Refunded" } },
    ],
  },
  {
    name: "attendance",
    type: "select",
    required: true,
    defaultValue: "unknown",
    options: [
      { value: "unknown", label: { fr: "Inconnue", en: "Unknown" } },
      { value: "present", label: { fr: "Présent", en: "Present" } },
      { value: "absent", label: { fr: "Absent", en: "Absent" } },
    ],
  },
  { name: "cancelledAt", type: "date", access: adminUpdateOnly },
  {
    name: "cancellationOutcome",
    type: "select",
    access: adminUpdateOnly,
    options: [
      { value: "refund", label: { fr: "Remboursement", en: "Refund" } },
      { value: "credit", label: { fr: "Crédit", en: "Credit" } },
      { value: "none", label: { fr: "Aucun", en: "None" } },
    ],
  },
]

/**
 * `enrollments` — one row per attendee seat. CONTRACT §3.4.
 * UNIQUE `(order, session, attendeeIndex)`. Access §3.7: customer reads own;
 * staff read + update attendance; admin CRUD.
 */
export const Enrollments: CollectionConfig = {
  slug: "enrollments",
  labels: {
    singular: { fr: "Inscription", en: "Enrollment" },
    plural: { fr: "Inscriptions", en: "Enrollments" },
  },
  admin: {
    defaultColumns: ["session", "customer", "attendeeName", "seatAmount", "status", "attendance"],
    group: salesGroup,
  },
  access: {
    read: ownsDocument("customer"),
    create: isAdmin,
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ["order", "session", "attendeeIndex"], unique: true }],
  fields,
}
