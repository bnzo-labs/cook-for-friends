import type { Block } from "payload"

export const RichTextBlock: Block = {
  slug: "richText",
  interfaceName: "RichTextBlock",
  labels: { singular: { fr: "Texte riche", en: "Rich text" }, plural: { fr: "Textes riches", en: "Rich text" } },
  fields: [{ name: "content", type: "richText", required: true, localized: true }],
}
