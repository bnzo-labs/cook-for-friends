import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getPayload } from "@/lib/payload"
import { BlockRenderer } from "@/components/storefront/blocks/BlockRenderer"
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
  const { locale } = await params
  const payload = await getPayload()
  const slug = HOME_SLUG[locale] ?? "home"

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: slug } }],
    },
    locale: locale as "fr" | "en",
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
  const { locale } = await params
  const payload = await getPayload()
  const slug = HOME_SLUG[locale] ?? "home"

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: slug } }],
    },
    locale: locale as "fr" | "en",
    fallbackLocale: "fr",
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  const page = res.docs[0] as Page | undefined

  if (!page) {
    notFound()
  }

  const blocks = page.layout ?? []

  return <BlockRenderer blocks={blocks} />
}
