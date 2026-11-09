import type { MetadataRoute } from "next"
import { getPayload } from "@/lib/payload"
import { locales, defaultLocale, type Locale } from "@/i18n/locales"
import { absoluteUrl } from "@/components/storefront/seo/indexable"
import {
  HREFLANG,
  pagePaths,
  slugPaths,
  staticPaths,
  type LocalizedPaths,
} from "@/components/storefront/seo/metadata"

// Reads the DB per request window; never prerendered at build time.
export const dynamic = "force-dynamic"

/** Home page slugs per locale (seed: accueil / home); they map to "/". */
const HOME_SLUGS = new Set(["accueil", "home"])

type Entry = MetadataRoute.Sitemap[number]
type Slugs = Record<Locale, string>

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

/** Per-locale slugs from a `locale: 'all'` read, French as fallback. */
function toSlugs(raw: unknown): Slugs | null {
  const all = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<Locale, unknown>>
  const fallback = all[defaultLocale]
  if (!nonEmpty(fallback)) return null
  return Object.fromEntries(
    locales.map((l) => [l, nonEmpty(all[l]) ? all[l] : fallback]),
  ) as Slugs
}

/** One entry per locale; each carries the full hreflang alternate set. */
export function entriesFor(paths: LocalizedPaths, lastModified?: string): Entry[] {
  const languages: Record<string, string> = Object.fromEntries(
    locales.map((l) => [HREFLANG[l], absoluteUrl(paths[l])]),
  )
  languages["x-default"] = absoluteUrl(paths[defaultLocale])
  return locales.map((l) => ({
    url: absoluteUrl(paths[l]),
    ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
    alternates: { languages },
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload()
  const [courses, products, pages] = await Promise.all([
    payload.find({
      collection: "courses",
      where: {
        and: [{ _status: { equals: "published" } }, { status: { equals: "published" } }],
      },
      locale: "all",
      depth: 0,
      limit: 0,
      pagination: false,
      select: { slug: true, updatedAt: true },
      overrideAccess: true,
    }),
    payload.find({
      collection: "products",
      where: { status: { equals: "published" } },
      locale: "all",
      depth: 0,
      limit: 0,
      pagination: false,
      select: { slug: true, updatedAt: true },
      overrideAccess: true,
    }),
    payload.find({
      collection: "pages",
      where: { _status: { equals: "published" } },
      locale: "all",
      depth: 0,
      limit: 0,
      pagination: false,
      select: { slug: true, updatedAt: true },
      overrideAccess: true,
    }),
  ])

  const out: Entry[] = [
    ...entriesFor(staticPaths("/")),
    ...entriesFor(staticPaths("/courses")),
    ...entriesFor(staticPaths("/products")),
  ]

  for (const doc of courses.docs) {
    const slugs = toSlugs(doc.slug)
    if (slugs) out.push(...entriesFor(slugPaths("/courses/[slug]", slugs), doc.updatedAt))
  }
  for (const doc of products.docs) {
    const slugs = toSlugs(doc.slug)
    if (slugs) out.push(...entriesFor(slugPaths("/products/[slug]", slugs), doc.updatedAt))
  }
  for (const doc of pages.docs) {
    const slugs = toSlugs(doc.slug)
    if (!slugs || locales.some((l) => HOME_SLUGS.has(slugs[l]))) continue
    out.push(...entriesFor(pagePaths(slugs), doc.updatedAt))
  }
  return out
}
