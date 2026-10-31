import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Section, Container } from "@/components/layout"
import type { CtaBlock as CtaBlockType } from "@/payload-types"

export interface CtaBlockProps {
  block: CtaBlockType
}

/**
 * CTA band block.
 * Full-width accent band with heading, body text, and a primary button.
 * Intentionally high-contrast using surface token with a left accent bar.
 */
export function CtaBlock({ block }: CtaBlockProps) {
  return (
    <Section tone="muted">
      <Container>
        <div className="relative overflow-hidden rounded-card border border-border bg-surface px-8 py-12 shadow-card sm:px-12 sm:py-16">
          {/* Left accent bar */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1 rounded-l-card bg-primary"
          />

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:max-w-[32rem]">
              <h2 className="font-display text-xl font-semibold leading-tight text-fg sm:text-2xl">
                {block.heading}
              </h2>
              {block.body && (
                <p className="text-base leading-[var(--leading-body)] text-fg-muted">
                  {block.body}
                </p>
              )}
            </div>

            <Button asChild size="lg" variant="primary" className="shrink-0">
              <Link href={block.buttonHref as never}>{block.buttonLabel}</Link>
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  )
}
