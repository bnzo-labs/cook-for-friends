import type { Block } from "payload"

export const TestimonialsBlock: Block = {
  slug: "testimonials",
  interfaceName: "TestimonialsBlock",
  labels: { singular: { fr: "Témoignages", en: "Testimonials" }, plural: { fr: "Témoignages", en: "Testimonials" } },
  fields: [
    { name: "heading", type: "text", localized: true },
    {
      name: "items",
      type: "array",
      minRows: 1,
      fields: [
        { name: "quote", type: "textarea", required: true, localized: true },
        { name: "author", type: "text", required: true },
        { name: "role", type: "text", localized: true },
      ],
    },
  ],
}
