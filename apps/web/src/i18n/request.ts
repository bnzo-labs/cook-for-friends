import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  // Validate the locale — fall back to the default if invalid
  if (!locale || !routing.locales.includes(locale as "fr" | "en")) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (
      await import(
        /* webpackChunkName: "messages-[request]" */
        `./messages/${locale}.json`
      )
    ).default,
  }
})
