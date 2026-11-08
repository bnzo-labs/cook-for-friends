import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Container } from "@/components/layout"
import type { HeroBlock as HeroBlockType } from "@/payload-types"

export interface HeroBlockProps {
  block: HeroBlockType
}

/**
 * Editorial hero block.
 * Split layout: text left, image right on md+.
 * Mobile: stacked, image full-width.
 * Intentionally asymmetric — text gets more horizontal space on large screens.
 */
export function HeroBlock({ block }: HeroBlockProps) {
  const imageMedia =
    block.image && typeof block.image === "object" && "url" in block.image
      ? block.image
      : null

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-bg"
    >
      <Container className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto] md:gap-16 lg:grid-cols-[1fr_480px]">
        {/* Text column */}
        <div className="flex flex-col justify-center py-[var(--space-section)] md:max-w-[36rem]">
          <h1
            id="hero-heading"
            className="font-display text-hero font-semibold leading-[var(--leading-tight)] tracking-tight text-fg"
          >
            {block.heading}
          </h1>
          {block.subheading && (
            <p className="mt-6 max-w-[45ch] text-lg leading-[var(--leading-body)] text-fg-muted">
              {block.subheading}
            </p>
          )}
          {block.ctaLabel && block.ctaHref && (
            <div className="mt-10">
              <Button asChild size="lg" variant="primary">
                <Link href={block.ctaHref as never}>{block.ctaLabel}</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Image column */}
        {imageMedia?.url && (
          <div className="relative -mx-4 sm:-mx-6 md:mx-0 md:my-8 md:overflow-hidden md:rounded-card">
            <div className="relative aspect-[4/3] md:aspect-[3/4] lg:aspect-[4/5]">
              <Image
                src={imageMedia.url}
                alt={imageMedia.alt ?? block.heading}
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 40vw, 480px"
                className="object-cover"
              />
            </div>
          </div>
        )}
      </Container>

      {/* Subtle texture band */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg/30"
      />
    </section>
  )
}
