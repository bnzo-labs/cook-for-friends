import type { CollectionConfig } from "payload"

import { isStaffOrAdmin, publishedOrStaff } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"
import { moneyField, validateInteger } from "../fields/money"
import { seoField } from "../fields/seo"

/**
 * `courses` — CONTRACT §3.1. Drafts enabled. Stripe fields are written only by
 * the commerce sync job (W2-01), so they are read-only in the admin.
 */
export const Courses: CollectionConfig = {
  slug: "courses",
  labels: {
    singular: { fr: "Cours", en: "Course" },
    plural: { fr: "Cours", en: "Courses" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "format", "price", "status", "stripeSyncStatus"],
    group: catalogGroup,
  },
  versions: { drafts: true },
  access: {
    read: publishedOrStaff({ status: { equals: "published" } }),
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true, label: { fr: "Titre", en: "Title" } },
    { name: "slug", type: "text", required: true, localized: true, unique: true, index: true },
    {
      name: "format",
      type: "select",
      required: true,
      label: { fr: "Format", en: "Format" },
      options: [
        { value: "in_person", label: { fr: "En personne", en: "In person" } },
        { value: "online", label: { fr: "En ligne", en: "Online" } },
      ],
    },
    { name: "summary", type: "textarea", localized: true, label: { fr: "Résumé", en: "Summary" } },
    { name: "description", type: "richText", localized: true, label: { fr: "Description", en: "Description" } },
    {
      name: "level",
      type: "select",
      label: { fr: "Niveau", en: "Level" },
      options: [
        { value: "beginner", label: { fr: "Débutant", en: "Beginner" } },
        { value: "intermediate", label: { fr: "Intermédiaire", en: "Intermediate" } },
        { value: "advanced", label: { fr: "Avancé", en: "Advanced" } },
      ],
    },
    {
      name: "durationMinutes",
      type: "number",
      min: 0,
      label: { fr: "Durée (minutes)", en: "Duration (minutes)" },
      validate: (v: unknown) => validateInteger(0)(v),
    },
    moneyField({
      name: "price",
      required: true,
      label: { fr: "Prix (cents, taxes en sus)", en: "Price (cents, tax-exclusive)" },
    }),
    { name: "heroImage", type: "upload", relationTo: "media", label: { fr: "Image principale", en: "Hero image" } },
    { name: "gallery", type: "upload", relationTo: "media", hasMany: true, label: { fr: "Galerie", en: "Gallery" } },
    {
      name: "lessons",
      type: "relationship",
      relationTo: "lessons",
      hasMany: true,
      label: { fr: "Leçons (ordonnées)", en: "Lessons (ordered)" },
      admin: { condition: (data) => data?.format === "online", isSortable: true },
    },
    { name: "materials", type: "relationship", relationTo: "materials", hasMany: true, label: { fr: "Matériel", en: "Materials" } },
    {
      name: "status",
      type: "select",
      // Own Postgres enum: the default `enum_courses_status` collides with the
      // drafts `_status` enum (draft|published only) and rejects 'archived'.
      enumName: "enum_courses_lifecycle_status",
      required: true,
      defaultValue: "draft",
      index: true,
      label: { fr: "Statut", en: "Status" },
      options: [
        { value: "draft", label: { fr: "Brouillon", en: "Draft" } },
        { value: "published", label: { fr: "Publié", en: "Published" } },
        { value: "archived", label: { fr: "Archivé", en: "Archived" } },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "stripeProductId",
      type: "text",
      index: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripePriceId",
      type: "text",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripeSyncStatus",
      type: "select",
      defaultValue: "pending",
      options: [
        { value: "pending", label: { fr: "En attente", en: "Pending" } },
        { value: "synced", label: { fr: "Synchronisé", en: "Synced" } },
        { value: "error", label: { fr: "Erreur", en: "Error" } },
      ],
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "stripeSyncError",
      type: "textarea",
      admin: { readOnly: true, position: "sidebar" },
    },
    seoField,
    {
      name: "certificateEnabled",
      type: "checkbox",
      defaultValue: false,
      label: { fr: "Certificat de réussite", en: "Completion certificate" },
    },
  ],
}
