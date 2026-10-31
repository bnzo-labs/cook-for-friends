import { notFound } from "next/navigation"
import { getPayload } from "@/lib/payload"
import { BlockRenderer } from "@/components/storefront/blocks/BlockRenderer"
import type { Metadata } from "next"
import type { Page } from "@/payload-types"

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const pageSlug = slug.join("/")
  const payload = await getPayload()

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: pageSlug } }],
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
  if (!page) return {}

  return {
    title: page.seo?.title ?? page.title,
    description: page.seo?.description ?? undefined,
  }
}

export default async function PayloadPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>
}) {
  const { locale, slug } = await params
  const pageSlug = slug.join("/")
  const payload = await getPayload()

  const res = await payload.find({
    collection: "pages",
    where: {
      and: [{ _status: { equals: "published" } }, { slug: { equals: pageSlug } }],
    },
    locale: locale as "fr" | "en",
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
