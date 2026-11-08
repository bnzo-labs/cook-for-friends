import { getTranslations } from "next-intl/server"
import { getPayload } from "@/lib/payload"
import { assertLocale } from "@/i18n/locale"
import { ProductCard, type ProductCardData } from "@/components/storefront/ProductCard"
import { Section, Container } from "@/components/layout"
import type { Metadata } from "next"
import type { Media, Product } from "@/payload-types"

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale = assertLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: "storefront.products" })
  return { title: t("meta_title"), description: t("meta_description") }
}

function toProductCard(doc: Product): ProductCardData {
  const firstImage =
    doc.images?.[0] != null && typeof doc.images[0] === "object"
      ? (doc.images[0] as Media)
      : null

  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    description: doc.description ?? null,
    imageUrl: firstImage?.url ?? null,
    imageAlt: firstImage?.alt ?? null,
    priceDisplay: doc.priceDisplay ?? null,
    externalUrl: doc.externalUrl ?? null,
  }
}

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  const locale = assertLocale(rawLocale)

  const [payload, t] = await Promise.all([
    getPayload(),
    getTranslations({ locale, namespace: "storefront.products" }),
  ])

  const res = await payload.find({
    collection: "products",
    where: { status: { equals: "published" } },
    locale,
    fallbackLocale: "fr",
    depth: 1,
    limit: 100,
    pagination: false,
    overrideAccess: true,
  })

  const products = res.docs as Product[]

  return (
    <>
      <Section spacing="tight" tone="bg">
        <Container>
          <h1 className="font-display text-2xl font-semibold leading-tight text-fg sm:text-hero">
            {t("heading")}
          </h1>
        </Container>
      </Section>

      <Section tone="bg">
        <Container>
          {products.length === 0 ? (
            <p className="py-16 text-center text-fg-muted">{t("empty")}</p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              aria-label={t("heading")}
            >
              {products.map((product) => (
                <li key={product.id}>
                  <ProductCard
                    product={toProductCard(product)}
                    visitLabel={t("visit")}
                  />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  )
}
