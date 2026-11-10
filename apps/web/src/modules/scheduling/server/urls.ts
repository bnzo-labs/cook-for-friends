import type { Locale } from "@/modules/_shared"

export function siteOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").origin
}

/** Absolute, localized login page (no token). */
export async function loginUrl(locale: Locale): Promise<string> {
  const { getPathname } = await import("@/i18n/navigation")
  return `${siteOrigin()}${getPathname({ locale, href: "/auth/login" })}`
}

/** Absolute, localized course detail page. */
export async function courseUrl(locale: Locale, slug: string | null | undefined): Promise<string> {
  if (!slug) return `${siteOrigin()}/${locale}`
  const { getPathname } = await import("@/i18n/navigation")
  return `${siteOrigin()}${getPathname({ locale, href: { pathname: "/courses/[slug]", params: { slug } } })}`
}
