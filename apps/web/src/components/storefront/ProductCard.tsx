import Image from "next/image"
import { Link } from "@/i18n/navigation"

export interface ProductCardData {
  id: number
  title: string
  slug: string
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
  priceDisplay: string | null
  externalUrl: string | null
}

export interface ProductCardProps {
  product: ProductCardData
  visitLabel: string
}

/**
 * Product display card.
 * Products are display-only in Wave 2 — no cart/checkout (that's W2-10).
 * External link opens in new tab when externalUrl is present.
 * Square image for product consistency.
 */
export function ProductCard({ product, visitLabel }: ProductCardProps) {
  const href = { pathname: "/products/[slug]" as const, params: { slug: product.slug } }

  return (
    <article>
      <Link
        href={href}
        className={[
          "group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card",
          "transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-out",
          "hover:-translate-y-0.5 hover:shadow-raised",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        ].join(" ")}
      >
        {/* Square image */}
        <div className="relative aspect-square overflow-hidden bg-surface-muted">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt ?? product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-[var(--duration-normal)] ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="absolute inset-0 bg-surface-muted" />
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-3 p-5">
          <h3 className="font-display text-lg font-semibold leading-tight text-fg">
            {product.title}
          </h3>

          {product.description && (
            <p className="text-sm leading-[var(--leading-body)] text-fg-muted line-clamp-3">
              {product.description}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
            {product.priceDisplay && (
              <span className="font-semibold text-fg">{product.priceDisplay}</span>
            )}
            <span className="text-sm text-primary">{visitLabel} →</span>
          </div>
        </div>
      </Link>
    </article>
  )
}
