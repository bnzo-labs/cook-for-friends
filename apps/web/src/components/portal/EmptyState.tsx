import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"

export interface EmptyStateProps {
  title: string
  body: string
  ctaLabel: string
  /** Where the CTA goes (always the catalog today). */
  ctaHref: "/courses"
}

/** DESIGN_SPEC EmptyState: quiet mark, message, one primary action. */
export function EmptyState({ title, body, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <div
      data-empty-state
      className="flex flex-col items-start gap-4 rounded-card border border-dashed border-border bg-surface px-6 py-10"
    >
      <span aria-hidden="true" className="block h-1 w-12 rounded-full bg-primary" />
      <h2 className="font-display text-xl font-semibold leading-tight text-fg">{title}</h2>
      <p className="max-w-prose text-fg-muted">{body}</p>
      <Button asChild>
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  )
}
