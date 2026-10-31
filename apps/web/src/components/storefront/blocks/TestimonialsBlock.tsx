import { Section, Container } from "@/components/layout"
import type { TestimonialsBlock as TestimonialsBlockType } from "@/payload-types"

export interface TestimonialsBlockProps {
  block: TestimonialsBlockType
}

/**
 * Testimonials block.
 * Pull-quote layout: large opening quote mark, author below.
 * Horizontal scroll on mobile; grid on md+.
 */
export function TestimonialsBlock({ block }: TestimonialsBlockProps) {
  const items = block.items ?? []
  if (items.length === 0) return null

  return (
    <Section tone="bg" aria-label={block.heading ?? "Testimonials"}>
      <Container>
        {block.heading && (
          <h2 className="mb-10 font-display text-2xl font-semibold leading-tight text-fg">
            {block.heading}
          </h2>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <figure
              key={item.id ?? i}
              className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card"
            >
              {/* Large opening quote mark — decorative */}
              <span
                aria-hidden="true"
                className="select-none font-display text-5xl leading-none text-primary/30"
              >
                &ldquo;
              </span>

              <blockquote>
                <p className="leading-[var(--leading-body)] text-fg">{item.quote}</p>
              </blockquote>

              <figcaption className="mt-auto flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{item.author}</span>
                {item.role && (
                  <span className="text-sm text-fg-muted">{item.role}</span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </Section>
  )
}
