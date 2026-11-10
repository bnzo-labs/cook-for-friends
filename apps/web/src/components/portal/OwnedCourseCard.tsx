import Image from "next/image"

import { Badge } from "@/components/ui/badge"
import { Link } from "@/i18n/navigation"
import type { CourseCard } from "@/modules/catalog"
import type { Locale } from "@/modules/_shared"

import { CourseProgress, type CourseProgressData, type CourseProgressLabels } from "./dashboard/CourseProgress"

export interface OwnedCourseCardProps {
  course: CourseCard
  formatLabel: string
  openLabel: string
  /** Learning progress for this course (W3-01b); absent on cards without data. */
  progress?: CourseProgressData
  progressLabels?: CourseProgressLabels
  locale?: Locale
}

/** Online course the customer owns: course link, then progress, "continue" and certificate actions. */
export function OwnedCourseCard({ course, formatLabel, openLabel, progress, progressLabels, locale }: OwnedCourseCardProps) {
  return (
    <li
      data-owned-course
      data-course-id={course.id}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card transition-[transform,box-shadow] duration-(--duration-normal) ease-out focus-within:shadow-raised hover:-translate-y-0.5 hover:shadow-raised motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <Link
        href={{ pathname: "/account/courses/[slug]", params: { slug: course.slug } }}
        className="flex flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-surface-muted">
          {course.heroImageUrl ? (
            <Image
              src={course.heroImageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : null}
          <Badge variant="neutral" className="absolute left-3 top-3">
            {formatLabel}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5 pb-3">
          <h3 className="font-display text-lg font-semibold leading-tight text-fg">{course.title}</h3>
          {course.summary ? <p className="line-clamp-2 text-sm text-fg-muted">{course.summary}</p> : null}
          {progress ? null : (
            <span className="mt-auto pt-2 text-sm font-medium text-primary underline underline-offset-4">{openLabel}</span>
          )}
        </div>
      </Link>
      {progress && progressLabels && locale ? (
        <CourseProgress progress={progress} labels={progressLabels} openLabel={openLabel} locale={locale} />
      ) : null}
    </li>
  )
}
