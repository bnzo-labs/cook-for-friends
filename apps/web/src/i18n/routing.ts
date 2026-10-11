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
})
