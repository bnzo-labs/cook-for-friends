import Image from "next/image"
import { Section, Container } from "@/components/layout"
import type { GalleryBlock as GalleryBlockType, Media } from "@/payload-types"

export interface GalleryBlockProps {
  block: GalleryBlockType
}

/**
 * Photo gallery block.
 * Organic grid: first image large (full-width on mobile, 2-col span on lg),
 * rest in a 2-column grid. Intentionally varied aspect ratios.
 */
export function GalleryBlock({ block }: GalleryBlockProps) {
  const images = (block.images ?? []).flatMap((img) => {
    if (typeof img === "object" && img !== null && "url" in img) return [img as Media]
    return []
  })

  if (images.length === 0) return null

  const [featured, ...rest] = images

  return (
    <Section tone="muted" aria-label={block.heading ?? "Gallery"}>
      <Container>
        {block.heading && (
          <h2 className="mb-10 font-display text-2xl font-semibold leading-tight text-fg">
            {block.heading}
          </h2>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {/* Featured image: spans full width on small, 2 cols on lg */}
          {featured?.url && (
            <div className="col-span-2 overflow-hidden rounded-card lg:col-span-2 lg:row-span-2">
              <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[400px]">
                <Image
                  src={featured.url}
                  alt={featured.alt ?? ""}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 66vw"
                  className="object-cover transition-transform duration-[var(--duration-normal)] ease-out hover:scale-[1.02]"
                />
              </div>
            </div>
          )}

          {/* Remaining images */}
          {rest.map(
            (img, i) =>
              img.url && (
                <div key={img.id ?? i} className="overflow-hidden rounded-card">
                  <div className="relative aspect-square">
                    <Image
                      src={img.url}
                      alt={img.alt ?? ""}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 22vw"
                      className="object-cover transition-transform duration-[var(--duration-normal)] ease-out hover:scale-[1.02]"
                    />
                  </div>
                </div>
              ),
          )}
        </div>
      </Container>
    </Section>
  )
}
