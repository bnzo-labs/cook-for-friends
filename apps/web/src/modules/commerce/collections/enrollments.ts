import type { Access, CollectionConfig, Field, FieldAccess, Where } from "payload"

import { isAdmin, isAdminField, isCustomerUser, isStaff, isStaffOrAdmin } from "@/modules/identity"
import { salesGroup } from "../labels"
import { moneyField, validateInteger } from "../money"

/** Staff may update only `attendance`; every other field is admin-only on update. */
const adminUpdateOnly: { update: FieldAccess } = { update: isAdminField }

/**
 * W4-03b (W2-11 L-3): money fields are readable by staff and by the buyer
 * (`order.customer`) only. A guest attendee reading their own seat via REST
 * does not see the price share.
 */
const relIdOf = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "object") return relIdOf((v as { id?: unknown }).id)
  return String(v)
}

export const readByStaffOrBuyer: FieldAccess = async ({ req, doc }) => {
  if (isStaff(req.user)) return true
  if (!isCustomerUser(req.user) || !req.user || !doc) return false
  const self = String(req.user.id)
  const order = (doc as { order?: unknown }).order
  if (order && typeof order === "object" && "customer" in order) return relIdOf((order as { customer: unknown }).customer) === self
  const orderId = relIdOf(order)
  if (orderId === null) return false
  const o = await req.payload
    .findByID({ collection: "orders", id: orderId, depth: 0, overrideAccess: true, select: { customer: true }, req })
    .catch(() => null)
  return relIdOf(o?.customer) === self
}

const moneyAccess = { ...adminUpdateOnly, read: readByStaffOrBuyer }

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
  moneyField({ name: "seatAmount", access: moneyAccess }),
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
  /**
   * W4-03b (W3-10 L-2): amount (cents) decided when the seat was cancelled,
   * refund or credit. Persisted in the cancel transaction so a refund retry
   * replays it instead of recomputing from the (possibly edited) policy.
   */
  moneyField({
    name: "cancellationAmount",
    access: moneyAccess,
    admin: { readOnly: true },
    label: { fr: "Montant d'annulation", en: "Cancellation amount" },
  }),
]

/**
 * Read (CONTRACT §3.7, CCR-W3-4): staff all; a customer reads seats they occupy
 * (`customer = self`) and every seat of orders they bought (`order.customer = self`).
 */
export const readOwnOrBoughtSeats: Access = ({ req }) => {
  if (isStaff(req.user)) return true
  if (!isCustomerUser(req.user) || !req.user) return false
  const self = req.user.id
  const where: Where = { or: [{ customer: { equals: self } }, { "order.customer": { equals: self } }] }
  return where
}

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
    read: readOwnOrBoughtSeats,
    create: isAdmin,
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ["order", "session", "attendeeIndex"], unique: true }],
  fields,
}
