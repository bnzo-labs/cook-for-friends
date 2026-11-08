import { getTranslations } from "next-intl/server"
import { getPayload } from "@/lib/payload"
import { assertLocale } from "@/i18n/locale"
import { BlockRenderer } from "@/components/storefront/blocks/BlockRenderer"
import { FallbackHomePage } from "@/components/storefront/FallbackHomePage"
import { pickHomePage } from "@/lib/storefront/pick-home-page"
import type { Metadata } from "next"
import type { Page } from "@/payload-types"

export const revalidate = 300

/** Map locale to its home page slug (see seed: accueil / home). */
const HOME_SLUG: Record<string, string> = { fr: "accueil", en: "home" }

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale = assertLocale(rawLocale)
  const payload = await getPayload()
  const slug = HOME_SLUG[locale] ?? "home"

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: slug } }],
    },
    locale,
    fallbackLocale: "fr",
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    select: { title: true, seo: true },
  })

  const page = res.docs[0] as Page | undefined
  const t = await getTranslations({ locale, namespace: "common" })

  return {
    title: page?.seo?.title ?? t("site_name"),
    description: page?.seo?.description ?? t("tagline"),
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  const locale = assertLocale(rawLocale)
  const payload = await getPayload()
  const slug = HOME_SLUG[locale] ?? "home"

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: slug } }],
    },
    locale,
    fallbackLocale: "fr",
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  const page = pickHomePage(res.docs as Page[])

  if (!page) {
    // CMS home page doc is absent (e.g. staging with no seed content).
    // Render a minimal fallback so the route returns 200 instead of 404.
    return <FallbackHomePage locale={locale} />
  }

  const blocks = page.layout ?? []

  return <BlockRenderer blocks={blocks} />
}
