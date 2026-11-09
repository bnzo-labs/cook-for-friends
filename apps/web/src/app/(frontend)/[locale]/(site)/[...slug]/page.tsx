import { notFound } from "next/navigation"
import { getPayload } from "@/lib/payload"
import { assertLocale } from "@/i18n/locale"
import { BlockRenderer } from "@/components/storefront/blocks/BlockRenderer"
import { getTranslations } from "next-intl/server"
import { buildPageMetadata, pagePaths } from "@/components/storefront/seo/metadata"
import { loadLocalizedSlugs } from "@/components/storefront/seo/slugs"
import type { Metadata } from "next"
import type { Page } from "@/payload-types"

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)
  const pageSlug = slug.join("/")
  const payload = await getPayload()

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: pageSlug } }],
    },
    locale,
    fallbackLocale: "fr",
    depth: 1,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    select: { title: true, seo: true },
  })

  const page = res.docs[0] as Page | undefined
  if (!page) return {}
  const [slugs, t] = await Promise.all([
    loadLocalizedSlugs("pages", page.id),
    getTranslations({ locale, namespace: "common" }),
  ])
  const image = page.seo?.image
  return buildPageMetadata({
    locale,
    paths: pagePaths(slugs),
    title: page.seo?.title ?? page.title,
    description: page.seo?.description,
    image: typeof image === "object" && image !== null ? image.url : null,
    siteName: t("site_name"),
  })
}

export default async function PayloadPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>
}) {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)
  const pageSlug = slug.join("/")
  const payload = await getPayload()

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: pageSlug } }],
    },
    locale,
    fallbackLocale: "fr",
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  const page = res.docs[0] as Page | undefined
  if (!page) notFound()

  const blocks = page.layout ?? []

  return (
    <article>
      <BlockRenderer blocks={blocks} />
    </article>
  )
}
