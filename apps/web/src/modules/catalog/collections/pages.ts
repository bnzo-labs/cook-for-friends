import type { CollectionConfig } from "payload"

import { isStaffOrAdmin, publishedOrStaff } from "@/modules/identity"
import { pageBlocks } from "../blocks"
import { catalogGroup } from "../fields/labels"
import { seoField } from "../fields/seo"

/**
 * `pages` — block-built content pages. CONTRACT §3.1. Drafts enabled so the
 * public only reads published pages (`_status`).
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  labels: {
    singular: { fr: "Page", en: "Page" },
    plural: { fr: "Pages", en: "Pages" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "_status"],
    group: catalogGroup,
  },
  versions: { drafts: true },
  access: {
    read: publishedOrStaff({ _status: { equals: "published" } }),
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true, label: { fr: "Titre", en: "Title" } },
    { name: "slug", type: "text", required: true, localized: true, index: true },
    { name: "layout", type: "blocks", blocks: pageBlocks, label: { fr: "Mise en page", en: "Layout" } },
    seoField,
  ],
}
