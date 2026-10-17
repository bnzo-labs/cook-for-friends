import type { CollectionConfig, PayloadRequest, Validate } from "payload"

import { isStaffOrAdmin, publishedOrStaff } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"
import { validateInteger } from "../fields/money"

type RelValue = string | number | { id: string | number } | null | undefined

function relId(value: RelValue): string | number | null {
  if (value === null || value === undefined) return null
  return typeof value === "object" ? value.id : value
}

/** `sessions.course` must reference an in-person course. Exported for tests. */
export async function validateInPersonCourse(
  value: RelValue,
  { req }: { req: PayloadRequest },
): Promise<true | string> {
  const id = relId(value)
  if (id === null) return "Cours requis / Course required"
  try {
    const course = await req.payload.findByID({
      collection: "courses",
      id,
      depth: 0,
      draft: true,
      req,
      overrideAccess: true,
    })
    if (course?.format !== "in_person") {
      return "Le cours doit être en personne / Course must be in person"
    }
    return true
  } catch (err) {
    req.payload.logger.warn({ err, courseId: id }, "sessions.course validation: course lookup failed")
    return "Cours introuvable / Course not found"
  }
}

/** `endsAt` must be after `startsAt`. */
export function validateEndsAfterStart(
  value: unknown,
  { siblingData }: { siblingData: { startsAt?: unknown } },
): true | string {
  if (!value || !siblingData?.startsAt) return true
  const end = new Date(String(value)).getTime()
  const start = new Date(String(siblingData.startsAt)).getTime()
  if (Number.isNaN(end) || Number.isNaN(start)) return true
  return end > start ? true : "La fin doit suivre le début / End must be after start"
}

/**
 * `sessions` — in-person course dates. CONTRACT §3.1. Stored UTC; displayed
 * America/Toronto by the storefront. Index `(course, startsAt)`.
 */
export const Sessions: CollectionConfig = {
  slug: "sessions",
  labels: {
    singular: { fr: "Séance", en: "Session" },
    plural: { fr: "Séances", en: "Sessions" },
  },
  admin: {
    useAsTitle: "startsAt",
    defaultColumns: ["course", "startsAt", "capacity", "status"],
    group: catalogGroup,
  },
  access: {
    // Public: only sessions whose course is published.
    read: publishedOrStaff({ "course.status": { equals: "published" } }),
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  indexes: [{ fields: ["course", "startsAt"] }],
  fields: [
    {
      name: "course",
      type: "relationship",
      relationTo: "courses",
      required: true,
      label: { fr: "Cours", en: "Course" },
      filterOptions: { format: { equals: "in_person" } },
      validate: ((value, { req }) => validateInPersonCourse(value as RelValue, { req })) as Validate,
    },
    {
      name: "startsAt",
      type: "date",
      required: true,
      label: { fr: "Début", en: "Starts at" },
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "endsAt",
      type: "date",
      required: true,
      label: { fr: "Fin", en: "Ends at" },
      admin: { date: { pickerAppearance: "dayAndTime" } },
      validate: (value, opts) =>
        validateEndsAfterStart(value, opts as { siblingData: { startsAt?: unknown } }),
    },
    {
      name: "location",
      type: "group",
      label: { fr: "Lieu", en: "Location" },
      fields: [
        { name: "name", type: "text", localized: true },
        { name: "address", type: "text" },
        { name: "city", type: "text" },
        { name: "postalCode", type: "text" },
        { name: "mapsUrl", type: "text" },
      ],
    },
    {
      name: "level",
      type: "select",
      label: { fr: "Niveau (remplace celui du cours)", en: "Level (overrides course)" },
      options: [
        { value: "beginner", label: { fr: "Débutant", en: "Beginner" } },
        { value: "intermediate", label: { fr: "Intermédiaire", en: "Intermediate" } },
        { value: "advanced", label: { fr: "Avancé", en: "Advanced" } },
      ],
    },
    {
      name: "capacity",
      type: "number",
      required: true,
      min: 1,
      label: { fr: "Capacité", en: "Capacity" },
      validate: (v: unknown) => validateInteger(1)(v),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "scheduled",
      index: true,
      label: { fr: "Statut", en: "Status" },
      options: [
        { value: "scheduled", label: { fr: "Planifiée", en: "Scheduled" } },
        { value: "cancelled", label: { fr: "Annulée", en: "Cancelled" } },
        { value: "completed", label: { fr: "Terminée", en: "Completed" } },
      ],
    },
    { name: "notes", type: "textarea", localized: true, label: { fr: "Notes", en: "Notes" } },
  ],
}
