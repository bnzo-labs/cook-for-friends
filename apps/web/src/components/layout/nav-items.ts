/**
 * Primary navigation. `labelKey` is a key under the `layout.nav` namespace.
 * Hrefs are locale-less (next-intl adds the prefix). Translated pathnames
 * (/cours vs /courses) arrive with the storefront (W2-05) via `routing.ts`.
 */
export const NAV_ITEMS = [
  { href: "/courses", labelKey: "courses" },
  { href: "/products", labelKey: "products" },
  { href: "/account", labelKey: "account" },
] as const

export type NavItem = (typeof NAV_ITEMS)[number]
