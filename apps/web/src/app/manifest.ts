import type { MetadataRoute } from "next"
import fr from "@/i18n/messages/fr.json"

/**
 * Web app manifest. FR is the default locale (Bill 96), so name/lang are FR.
 *
 * Colors: a manifest cannot read CSS variables, so the hex values below are
 * the sRGB renders of the tokens (src/styles/tokens.css) and are the ONLY
 * hard-coded colors allowed in the codebase:
 *   --color-bg      = --brand-paper  oklch(98.5% 0.005 80) -> #fcfaf6
 *   --color-primary = --brand-accent oklch(55% 0.12 45)    -> #aa5830
 * Re-compute both when D4 (brand) replaces the placeholder tokens.
 */
const BACKGROUND_COLOR = "#fcfaf6" // --color-bg
const THEME_COLOR = "#aa5830" // --color-primary

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: fr.pwa.name,
    short_name: fr.pwa.short_name,
    description: fr.pwa.description,
    lang: "fr-CA",
    dir: "ltr",
    start_url: "/fr/compte",
    scope: "/",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
