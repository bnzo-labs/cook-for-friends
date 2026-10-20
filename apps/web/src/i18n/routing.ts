import { defineRouting } from "next-intl/routing"
import { locales, defaultLocale } from "./locales"

export const routing = defineRouting({
  locales,
  defaultLocale,
  /**
   * Always prefix URLs with the locale: /fr/... and /en/...
   * Bill 96 (Charter of the French Language): FR must be the default and predominant language.
   */
  localePrefix: "always",
  /**
   * Translated pathnames (CONTRACT §5.2). Keys are the internal (EN) route
   * names used in code; values are the public URL per locale.
   */
  pathnames: {
    "/": "/",
    "/courses": { fr: "/cours", en: "/courses" },
    "/courses/[slug]": { fr: "/cours/[slug]", en: "/courses/[slug]" },
    "/products": { fr: "/produits", en: "/products" },
    "/products/[slug]": { fr: "/produits/[slug]", en: "/products/[slug]" },
    "/cart": { fr: "/panier", en: "/cart" },
    "/checkout/success": { fr: "/commande/merci", en: "/checkout/success" },
    "/checkout/cancelled": { fr: "/commande/annulee", en: "/checkout/cancelled" },
    "/certificates/verify/[code]": {
      fr: "/certificats/verifier/[code]",
      en: "/certificates/verify/[code]",
    },
    "/auth/login": { fr: "/connexion", en: "/auth/login" },
    "/auth/verify": { fr: "/connexion/verifier", en: "/auth/verify" },
    "/account": { fr: "/compte", en: "/account" },
    "/account/courses/[slug]": { fr: "/compte/cours/[slug]", en: "/account/courses/[slug]" },
    "/account/courses/[slug]/[lesson]": {
      fr: "/compte/cours/[slug]/[lesson]",
      en: "/account/courses/[slug]/[lesson]",
    },
    "/account/sessions": { fr: "/compte/sessions", en: "/account/sessions" },
    "/account/history": { fr: "/compte/historique", en: "/account/history" },
    "/account/receipts": { fr: "/compte/recus", en: "/account/receipts" },
    "/account/profile": { fr: "/compte/profil", en: "/account/profile" },
  },
})
