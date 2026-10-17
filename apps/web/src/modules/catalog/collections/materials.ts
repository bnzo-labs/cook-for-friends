import type { CollectionConfig } from "payload"

import { locales } from "@/i18n/locales"
import { isStaffOrAdmin } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"

/**
 * `materials` — recipes and PDFs attached to courses/lessons. CONTRACT §3.1.
 * Files are served only through the signed route `/api/materials/:id`.
 */
export const Materials: CollectionConfig = {
  slug: "materials",
  labels: {
    singular: { fr: "Matériel", en: "Material" },
    plural: { fr: "Matériel", en: "Materials" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "kind", "locale"],
    group: catalogGroup,
  },
  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true, label: { fr: "Titre", en: "Title" } },
    { name: "file", type: "upload", relationTo: "media", required: true, label: { fr: "Fichier", en: "File" } },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "recipe",
      label: { fr: "Type", en: "Kind" },
      options: [
        { value: "recipe", label: { fr: "Recette", en: "Recipe" } },
        { value: "pdf", label: "PDF" },
        { value: "other", label: { fr: "Autre", en: "Other" } },
      ],
    },
    {
      name: "locale",
      type: "select",
      label: { fr: "Langue du fichier", en: "File language" },
      options: locales.map((l) => ({ value: l, label: l === "fr" ? "Français" : "English" })),
    },
  ],
}
