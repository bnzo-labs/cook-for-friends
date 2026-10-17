import type { CollectionConfig } from "payload"

import { isStaff, isStaffOrAdmin } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"

/**
 * `media` — uploads stored in the private R2 bucket. CONTRACT §3.1.
 * Public read is limited to images. Non-image files (recipes, PDFs) are served
 * only through the access-checked route `/api/materials/:id`.
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: {
    singular: { fr: "Média", en: "Media" },
    plural: { fr: "Médias", en: "Media" },
  },
  admin: {
    useAsTitle: "filename",
    group: catalogGroup,
  },
  access: {
    read: ({ req }) => (isStaff(req.user) ? true : { mimeType: { like: "image/" } }),
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  upload: {
    mimeTypes: ["image/*", "application/pdf"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      localized: true,
      label: { fr: "Texte alternatif", en: "Alt text" },
    },
  ],
}
