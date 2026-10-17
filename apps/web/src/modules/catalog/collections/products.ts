import type { CollectionConfig } from "payload"

import { isStaffOrAdmin, publishedOrStaff } from "@/modules/identity"
import { catalogGroup } from "../fields/labels"

/**
 * `products` — display-only catalogue (no ordering in MVP). CONTRACT §3.1.
 */
export const Products: CollectionConfig = {
  slug: "products",
  labels: {
    singular: { fr: "Produit", en: "Product" },
    plural: { fr: "Produits", en: "Products" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "priceDisplay", "status"],
    group: catalogGroup,
  },
  access: {
    read: publishedOrStaff({ status: { equals: "published" } }),
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isStaffOrAdmin,
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true, label: { fr: "Titre", en: "Title" } },
    { name: "slug", type: "text", required: true, localized: true, index: true },
    { name: "description", type: "textarea", localized: true, label: { fr: "Description", en: "Description" } },
    { name: "images", type: "upload", relationTo: "media", hasMany: true, label: { fr: "Images", en: "Images" } },
    {
      name: "priceDisplay",
      type: "text",
      localized: true,
      label: { fr: "Prix affiché (texte)", en: "Displayed price (text)" },
    },
    { name: "externalUrl", type: "text", label: { fr: "Lien boutique externe", en: "External shop URL" } },
    {
      name: "status",
      type: "select",
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
  ],
}
