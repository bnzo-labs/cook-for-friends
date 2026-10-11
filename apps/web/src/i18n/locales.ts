/**
 * Single source of truth for locales.
 * Both next-intl routing and Payload localization import from here.
 * DO NOT hardcode locale strings elsewhere.
 */
export const locales = ["fr", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "fr"
