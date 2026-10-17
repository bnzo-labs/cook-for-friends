import type { CollectionConfig } from "payload"

import { isStaffOrAdmin } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"
import { validateInteger } from "../fields/money"

/**
 * `lessons` — online course lessons. CONTRACT §3.1. No public access: lessons
 * reach customers only through learning/video module functions. Video stores
 * provider IDs only, never URLs.
 */
export const Lessons: CollectionConfig = {
  slug: "lessons",
  labels: {
    singular: { fr: "Leçon", en: "Lesson" },
    plural: { fr: "Leçons", en: "Lessons" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "course", "order", "isPreview"],
    group: catalogGroup,
  },
  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  fields: [
    {
      name: "course",
      type: "relationship",
      relationTo: "courses",
      required: true,
      index: true,
      label: { fr: "Cours", en: "Course" },
      filterOptions: { format: { equals: "online" } },
    },
    { name: "title", type: "text", required: true, localized: true, label: { fr: "Titre", en: "Title" } },
    {
      name: "order",
      type: "number",
      required: true,
      defaultValue: 0,
      min: 0,
      label: { fr: "Ordre", en: "Order" },
      validate: (v: unknown) => validateInteger(0)(v),
    },
    { name: "body", type: "richText", localized: true, label: { fr: "Contenu", en: "Body" } },
    {
      name: "video",
      type: "group",
      label: { fr: "Vidéo", en: "Video" },
      fields: [
        {
          name: "provider",
          type: "select",
          options: [
            { value: "mux", label: "Mux" },
            { value: "bunny", label: "Bunny Stream" },
          ],
        },
        { name: "assetId", type: "text" },
        { name: "playbackId", type: "text" },
        { name: "durationSec", type: "number", min: 0, validate: (v: unknown) => validateInteger(0)(v) },
      ],
    },
    { name: "materials", type: "relationship", relationTo: "materials", hasMany: true, label: { fr: "Matériel", en: "Materials" } },
    {
      name: "isPreview",
      type: "checkbox",
      defaultValue: false,
      label: { fr: "Aperçu gratuit", en: "Free preview" },
    },
  ],
}
