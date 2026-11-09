import type { CollectionConfig } from "payload"

import { denyAll, isStaffOrAdmin } from "@/modules/identity"

/**
 * `reminder-deliveries` — exactly-once ledger for session reminders.
 * CONTRACT §3.5 (CCR-W3-5). UNIQUE `(enrollment, offsetHours)`: the reminder
 * job inserts the row first and only sends when the insert wins, so a retried
 * or concurrent run can never double-send. Local API (`overrideAccess`) only;
 * hidden from the admin UI.
 */
export const ReminderDeliveries: CollectionConfig = {
  slug: "reminder-deliveries",
  labels: {
    singular: { fr: "Rappel envoyé", en: "Reminder delivery" },
    plural: { fr: "Rappels envoyés", en: "Reminder deliveries" },
  },
  admin: {
    hidden: true,
    useAsTitle: "id",
    group: { fr: "Clients", en: "Customers" },
  },
  access: {
    read: isStaffOrAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  indexes: [{ fields: ["enrollment", "offsetHours"], unique: true }],
  fields: [
    { name: "enrollment", type: "relationship", relationTo: "enrollments", required: true, index: true },
    {
      name: "offsetHours",
      type: "number",
      required: true,
      min: 1,
      validate: (v: unknown) =>
        v === null || v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= 1)
          ? true
          : "Entier ≥ 1 requis / Integer ≥ 1 required",
    },
    {
      name: "sentAt",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
    { name: "jobId", type: "text" },
  ],
}
