import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Badge } from "@/components/ui/badge"
import type { CourseCard as CourseCardData } from "@/modules/catalog"
import type { Locale } from "@/modules/_shared"

export interface CourseCardProps {
  course: CourseCardData
  locale: Locale
  formatLabel: { in_person: string; online: string }
  levelLabel: { beginner: string; intermediate: string; advanced: string }
  nextSessionLabel: string
  taxesLabel: string
  availableInFrenchLabel: string
}

/** Price in cents → localized currency string. */
function formatPrice(amountCents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100)
}

/** ISO date → localized short date string (America/Toronto). */
function formatSessionDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate))
}

/**
 * Course catalog card.
 * Visual direction: editorial / warm. 4/5 image ratio. Left-aligned type.
 * States: idle, hover (lift + raised shadow), focus (outline).
 */
export function CourseCard({
  course,
  locale,
  formatLabel,
  levelLabel,
  nextSessionLabel,
  taxesLabel,
  availableInFrenchLabel,
}: CourseCardProps) {
  const href = { pathname: "/courses/[slug]" as const, params: { slug: course.slug } }
  const price = formatPrice(course.price.amount, locale)
  const nextDate = course.nextSessionAt ? formatSessionDate(course.nextSessionAt, locale) : null

  return (
    <article>
      <Link
        href={href}
        className={[
          "group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card",
          "transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-out",
          "hover:-translate-y-0.5 hover:shadow-raised",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "focus-visible:-translate-y-0.5 focus-visible:shadow-raised",
        ].join(" ")}
      >
        {/* Image — 4/5 aspect ratio per DESIGN_SPEC */}
        <div className="relative aspect-[4/5] overflow-hidden bg-surface-muted">
          {course.heroImageUrl ? (
            <Image
              src={course.heroImageUrl}
              alt={course.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-[var(--duration-normal)] ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="absolute inset-0 bg-surface-muted" />
          )}

          {/* Format badge — overlaid on image */}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge variant={course.format === "in_person" ? "accent" : "neutral"}>
              {formatLabel[course.format]}
            </Badge>
            {course.isLocaleFallback && (
              <Badge variant="outline">{availableInFrenchLabel}</Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-3 p-5">
          <h3 className="font-display text-lg font-semibold leading-tight text-fg line-clamp-2">
            {course.title}
          </h3>

          {course.summary && (
            <p className="text-sm leading-[var(--leading-body)] text-fg-muted line-clamp-2">
              {course.summary}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-subtle">
            {course.level && (
              <span>{levelLabel[course.level]}</span>
            )}
            {course.durationMinutes && (
              <span>{course.durationMinutes}&thinsp;min</span>
            )}
          </div>

          {/* Price + next session */}
          <div className="flex items-end justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-col">
              <span className="font-semibold text-fg">{price}</span>
              <span className="text-xs text-fg-subtle">{taxesLabel}</span>
            </div>
            {nextDate && (
              <span className="text-right text-xs text-fg-muted">
                {nextSessionLabel.replace("{date}", nextDate)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  )
}
