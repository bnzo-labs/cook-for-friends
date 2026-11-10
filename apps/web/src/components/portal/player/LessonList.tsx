import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@/components/ui/badge"
import { Link } from "@/i18n/navigation"
import type { CoursePlayerView } from "@/modules/learning"

export interface LessonListProps {
  slug: string
  lessons: CoursePlayerView["lessons"]
  currentLessonId: string | null
  labels: {
    nav: string
    lessonNumber: (n: number) => string
    done: string
    todo: string
    preview: string
  }
}

/** DESIGN_SPEC LessonList: ordered, completed check, current highlight. A `nav` with `aria-current="page"`. */
export function LessonList({ slug, lessons, currentLessonId, labels }: LessonListProps) {
  return (
    <nav aria-label={labels.nav} data-lesson-list>
      <ol className="flex flex-col gap-1">
        {lessons.map((lesson, index) => {
          const current = String(lesson.id) === currentLessonId
          return (
            <li key={String(lesson.id)}>
              <Link
                href={{
                  pathname: "/account/courses/[slug]/[lesson]",
                  params: { slug, lesson: String(lesson.id) },
                }}
                aria-current={current ? "page" : undefined}
                data-lesson-id={lesson.id}
                data-completed={lesson.completed ? "true" : "false"}
                className={[
                  "flex items-start gap-3 rounded-control border px-3 py-3 text-fg",
                  "transition-[background-color,border-color] duration-(--duration-fast) ease-out",
                  "hover:bg-surface-muted",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  current ? "border-primary bg-surface-muted" : "border-transparent",
                ].join(" ")}
              >
                {lesson.completed ? (
                  <CheckCircle aria-hidden="true" size={22} weight="fill" className="mt-0.5 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-fg-muted" />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-fg-muted">{labels.lessonNumber(index + 1)}</span>
                  <span className={current ? "font-semibold" : "font-medium"}>{lesson.title}</span>
                  <span className="sr-only">{lesson.completed ? labels.done : labels.todo}</span>
                  {lesson.isPreview ? (
                    <Badge variant="outline" className="mt-1 self-start">
                      {labels.preview}
                    </Badge>
                  ) : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
