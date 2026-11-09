import { getPayload } from "@/lib/payload"
import { locales, defaultLocale, type Locale } from "@/i18n/locales"

/**
 * Per-locale slugs of one Payload doc (fr fallback when a locale has none),
 * so hreflang alternates point at each locale's own translated slug.
 */
export async function loadLocalizedSlugs(
  collection: "products" | "pages",
  id: number,
): Promise<Record<Locale, string>> {
  const payload = await getPayload()
  const doc = await payload.findByID({
    collection,
    id,
    locale: "all",
    depth: 0,
    select: { slug: true },
    overrideAccess: true,
  })
  const all = (doc.slug ?? {}) as unknown as Partial<Record<Locale, string | null>>
  const fallback = all[defaultLocale] ?? ""
  return Object.fromEntries(
    locales.map((l) => [l, all[l]?.trim() ? (all[l] as string) : fallback]),
  ) as Record<Locale, string>
}
