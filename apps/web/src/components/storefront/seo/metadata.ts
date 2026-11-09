import type { Metadata } from "next"
import { getPathname } from "@/i18n/navigation"
import { locales, defaultLocale, type Locale } from "@/i18n/locales"
import { absoluteUrl, isIndexable } from "./indexable"

/** hreflang codes per site locale (DISCOVERY §4). */
export const HREFLANG: Record<Locale, string> = { fr: "fr-CA", en: "en-CA" }
const OG_LOCALE: Record<Locale, string> = { fr: "fr_CA", en: "en_CA" }

/** Public path (with locale prefix) of every locale for one resource. */
export type LocalizedPaths = Record<Locale, string>

type StaticRoute = "/" | "/courses" | "/products"
type SlugRoute = "/courses/[slug]" | "/products/[slug]"

/** Localized path of a static route in every locale. */
export function staticPaths(pathname: StaticRoute): LocalizedPaths {
  return Object.fromEntries(
    locales.map((l) => [l, getPathname({ locale: l, href: pathname })]),
  ) as LocalizedPaths
}

/** Localized paths of a slug route; slugs differ per locale. */
export function slugPaths(pathname: SlugRoute, slugs: Record<Locale, string>): LocalizedPaths {
  return Object.fromEntries(
    locales.map((l) => [l, getPathname({ locale: l, href: { pathname, params: { slug: slugs[l] } } })]),
  ) as LocalizedPaths
}

/** Payload catch-all pages have no translated pathname; locale prefix only. */
export function pagePaths(slugs: Record<Locale, string>): LocalizedPaths {
  return Object.fromEntries(
    locales.map((l) => [l, `/${l}/${slugs[l].split("/").map(encodeURIComponent).join("/")}`]),
  ) as LocalizedPaths
}

export function alternatesFor(locale: Locale, paths: LocalizedPaths): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = Object.fromEntries(
    locales.map((l) => [HREFLANG[l], absoluteUrl(paths[l])]),
  )
  languages["x-default"] = absoluteUrl(paths[defaultLocale])
  return { canonical: absoluteUrl(paths[locale]), languages }
}

export type PageMetaInput = {
  locale: Locale
  paths: LocalizedPaths
  title: string
  description?: string | null
  /** Hero image: absolute URL or site-relative path. */
  image?: string | null
  siteName: string
}

/**
 * Localized metadata: canonical + hreflang, OG + Twitter cards, and `noindex`
 * unless the canonical host is allow-listed (see indexable.ts).
 */
export function buildPageMetadata(input: PageMetaInput): Metadata {
  const { locale, paths, title, description, image, siteName } = input
  const url = absoluteUrl(paths[locale])
  const images = image ? [{ url: absoluteUrl(image) }] : undefined
  return {
    title,
    description: description ?? undefined,
    alternates: alternatesFor(locale, paths),
    robots: isIndexable() ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      url,
      siteName,
      title,
      description: description ?? undefined,
      locale: OG_LOCALE[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description: description ?? undefined,
      images: images?.map((i) => i.url),
    },
  }
}
