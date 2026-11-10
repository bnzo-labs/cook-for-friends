"use client"

import { Check, Trophy } from "@phosphor-icons/react/dist/ssr"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import type { Locale } from "@/modules/_shared"

import { certificatePdfHref } from "./certificate-link"
import { useLessonProgress } from "./useLessonProgress"
import { VideoPlayer } from "./VideoPlayer"

export interface LessonStageProps {
  lessonId: number
  courseSlug: string
  title: string
  videoStatus: string | null
  initialPositionSec: number
  initialCompleted: boolean
  nextLessonId: number | null
  /** The customer already holds a certificate: the server renders its card instead of the banner. */
  hasCertificate: boolean
}

/** Video + completion control + "course done" banner for one lesson. */
export function LessonStage(props: LessonStageProps) {
  const t = useTranslations("portal.player")
  const locale = useLocale() as Locale
  const progress = useLessonProgress({
    lessonId: props.lessonId,
    initialCompleted: props.initialCompleted,
    errorMessage: t("progress_error"),
  })
  const done = progress.courseResult?.courseCompleted === true && !props.hasCertificate

  return (
    <div className="flex flex-col gap-5">
      <VideoPlayer
        lessonId={props.lessonId}
        title={props.title}
        videoStatus={props.videoStatus}
        initialPositionSec={props.initialPositionSec}
        onSavePosition={progress.savePosition}
        onTrackPosition={progress.trackPosition}
        onEnded={() => void progress.markComplete()}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={progress.completed ? "secondary" : "primary"}
          loading={progress.saving}
          disabled={progress.completed}
          aria-pressed={progress.completed}
          onClick={() => void progress.markComplete()}
          data-mark-complete
        >
          {progress.completed ? <Check aria-hidden="true" size={18} weight="bold" /> : null}
          {progress.saving
            ? t("mark_complete_saving")
            : progress.completed
              ? t("mark_complete_done")
              : t("mark_complete")}
        </Button>
        {progress.completed && props.nextLessonId !== null ? (
          <Button asChild variant="link">
            <Link
              href={{
                pathname: "/account/courses/[slug]/[lesson]",
                params: { slug: props.courseSlug, lesson: String(props.nextLessonId) },
              }}
            >
              {t("next_lesson")}
            </Link>
          </Button>
        ) : null}
      </div>

      {done ? (
        <section
          role="status"
          data-course-complete
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
        >
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <Trophy aria-hidden="true" size={22} weight="duotone" className="text-primary" />
            {t("course_complete_title")}
          </h2>
          {progress.courseResult?.certificateId ? (
            <>
              <p className="text-fg-muted">{t("course_complete_body")}</p>
              <Button asChild className="self-start">
                <a href={certificatePdfHref(progress.courseResult.certificateId, locale)} download data-certificate-download>
                  {t("certificate_download")}
                </a>
              </Button>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
