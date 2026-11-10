import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import type { Locale } from "@/modules/_shared"

export type CourseProgressData = {
  slug: string
  completedLessons: number
  totalLessons: number
  nextLessonId: string | null
  completed: boolean
  certificateId: string | null
}

export type CourseProgressLabels = {
  /** "{completed} of {total} lessons" */
  summary: string
  /** Accessible name of the progress bar, includes the course title. */
  barLabel: string
  continue: string
  start: string
  completedBadge: string
  certificate: string
}

export interface CourseProgressProps {
  progress: CourseProgressData
  labels: CourseProgressLabels
  openLabel: string
  locale: Locale
}

/** Progress bar + primary action (continue / start / certificate) for one owned course. */
export function CourseProgress({ progress, labels, openLabel, locale }: CourseProgressProps) {
  const { completedLessons, totalLessons, completed } = progress
  const percent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0
  const course = { pathname: "/account/courses/[slug]", params: { slug: progress.slug } } as const
  const next =
    progress.nextLessonId !== null
      ? ({ pathname: "/account/courses/[slug]/[lesson]", params: { slug: progress.slug, lesson: progress.nextLessonId } } as const)
      : course
  return (
    <div data-course-progress className="flex flex-col gap-3 border-t border-border p-5 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted" data-progress-summary>
          {labels.summary}
        </p>
        {completed ? (
          <Badge variant="ok" data-progress-complete>
            {labels.completedBadge}
          </Badge>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={labels.barLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-progress-value={percent}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {completed ? (
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={course}>{openLabel}</Link>
            </Button>
            {progress.certificateId !== null ? (
              <Button asChild variant="link" size="sm">
                <a href={`/api/certificates/${progress.certificateId}/pdf?locale=${locale}`} data-certificate-link>
                  {labels.certificate}
                </a>
              </Button>
            ) : null}
          </>
        ) : (
          <Button asChild size="sm">
            <Link href={next} data-continue-link>
              {completedLessons > 0 ? labels.continue : labels.start}
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
