import { notFound } from "next/navigation"
import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { getPayload } from "@/lib/payload"
import { Button } from "@/components/ui/button"
import { Section, Container } from "@/components/layout"
import type { Metadata } from "next"
import type { Media, Product } from "@/payload-types"

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const payload = await getPayload()

  const res = await payload.find({
    collection: "products",
    where: {
      and: [{ status: { equals: "published" } }, { slug: { equals: slug } }],
    },
    locale: locale as "fr" | "en",
    fallbackLocale: "fr",
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    select: { title: true },
  })

  const product = res.docs[0] as Product | undefined
  if (!product) return {}
  return { title: product.title }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  const [payload, t] = await Promise.all([
    getPayload(),
    getTranslations({ locale, namespace: "storefront.products" }),
  ])

  const res = await payload.find({
    collection: "products",
    where: {
      and: [{ status: { equals: "published" } }, { slug: { equals: slug } }],
    },
    locale: locale as "fr" | "en",
    fallbackLocale: "fr",
    depth: 1,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  const product = res.docs[0] as Product | undefined
  if (!product) notFound()

  const images = (product.images ?? []).flatMap((img) =>
    typeof img === "object" && img !== null && "url" in img ? [img as Media] : [],
  )
  const heroImage = images[0]

  return (
    <Section spacing="hero" tone="bg">
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[480px_1fr]">
          {/* Images */}
          <div className="flex flex-col gap-4">
            {heroImage?.url ? (
              <div className="overflow-hidden rounded-card">
                <div className="relative aspect-square">
                  <Image
                    src={heroImage.url}
                    alt={heroImage.alt ?? product.title}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 480px"
                    className="object-cover"
                  />
                </div>
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-card bg-surface-muted" />
            )}

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {images.slice(1).map((img, i) =>
                  img.url ? (
                    <div
                      key={img.id ?? i}
                      className="relative size-20 shrink-0 overflow-hidden rounded-control"
                    >
                      <Image
                        src={img.url}
                        alt={img.alt ?? ""}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-2xl font-semibold leading-tight text-fg sm:text-hero">
              {product.title}
            </h1>

            {product.priceDisplay && (
              <p className="font-display text-xl font-semibold text-fg">
                {product.priceDisplay}
              </p>
            )}

            {product.description && (
              <p className="max-w-[52ch] leading-[var(--leading-body)] text-fg-muted">
                {product.description}
              </p>
            )}

            {product.externalUrl && (
              <div className="mt-4">
                <Button asChild size="lg" variant="primary">
                  <a
                    href={product.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("visit")} →
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </Container>
    </Section>
  )
}
