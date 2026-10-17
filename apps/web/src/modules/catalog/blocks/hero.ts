import type { Block } from "payload"

export const HeroBlock: Block = {
  slug: "hero",
  interfaceName: "HeroBlock",
  labels: { singular: { fr: "Bannière", en: "Hero" }, plural: { fr: "Bannières", en: "Heroes" } },
  fields: [
    { name: "heading", type: "text", required: true, localized: true },
    { name: "subheading", type: "textarea", localized: true },
    { name: "image", type: "upload", relationTo: "media" },
    { name: "ctaLabel", type: "text", localized: true },
    { name: "ctaHref", type: "text" },
  ],
}
