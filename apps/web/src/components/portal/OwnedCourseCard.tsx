import Image from "next/image"

import { Badge } from "@/components/ui/badge"
import { Link } from "@/i18n/navigation"
import type { CourseCard } from "@/modules/catalog"

export interface OwnedCourseCardProps {
  course: CourseCard
  formatLabel: string
  openLabel: string
}

/**
 * Online course the customer owns. The player (`/account/courses/[slug]`) is
 * W3-03b; until it lands the link 404s on preview (accepted, see task notes).
 */
export function OwnedCourseCard({ course, formatLabel, openLabel }: OwnedCourseCardProps) {
  return (
    <li data-owned-course data-course-id={course.id}>
      <Link
        href={{ pathname: "/account/courses/[slug]", params: { slug: course.slug } }}
        className={[
          "group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card",
          "transition-[transform,box-shadow] duration-(--duration-normal) ease-out",
          "hover:-translate-y-0.5 hover:shadow-raised",
          "focus-visible:-translate-y-0.5 focus-visible:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        ].join(" ")}
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
        <div className="flex flex-1 flex-col gap-2 p-5">
          <h3 className="font-display text-lg font-semibold leading-tight text-fg">{course.title}</h3>
          {course.summary ? <p className="line-clamp-2 text-sm text-fg-muted">{course.summary}</p> : null}
          <span className="mt-auto pt-2 text-sm font-medium text-primary underline underline-offset-4">{openLabel}</span>
        </div>
      </Link>
    </li>
  )
}
