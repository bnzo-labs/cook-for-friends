import type { Block } from "payload"

export const GalleryBlock: Block = {
  slug: "gallery",
  interfaceName: "GalleryBlock",
  labels: { singular: { fr: "Galerie", en: "Gallery" }, plural: { fr: "Galeries", en: "Galleries" } },
  fields: [
    { name: "heading", type: "text", localized: true },
    { name: "images", type: "upload", relationTo: "media", hasMany: true },
  ],
}
