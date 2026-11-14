import type { CollectionConfig } from "payload"

import { isStaffOrAdmin } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"
import { mediaReadAccess } from "../server/material-media"

/**
 * `media` — uploads stored in the private R2 bucket. CONTRACT §3.1.
 * Public read is limited to images that no `materials.file` references (W3-13).
 * Material files (recipes as PDF or image) are served only through the
 * access-checked route `/api/materials/:id`.
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
    read: mediaReadAccess,
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
