import type { Block } from "payload"

export const CtaBlock: Block = {
  slug: "cta",
  interfaceName: "CtaBlock",
  labels: { singular: { fr: "Appel à l'action", en: "Call to action" }, plural: { fr: "Appels à l'action", en: "Calls to action" } },
  fields: [
    { name: "heading", type: "text", required: true, localized: true },
    { name: "body", type: "textarea", localized: true },
    { name: "buttonLabel", type: "text", required: true, localized: true },
    { name: "buttonHref", type: "text", required: true },
  ],
}
