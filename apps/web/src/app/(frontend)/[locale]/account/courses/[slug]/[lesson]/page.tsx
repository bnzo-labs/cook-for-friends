import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"

import { CommentsSection } from "@/components/portal/comments"
import {
  CertificateCard,
  LessonHeading,
  LessonList,
  LessonStage,
  MaterialsList,
  PlayerForbidden,
  ProgressBar,
  loadPlayer,
  requirePlayerCustomer,
} from "@/components/portal/player"
import { lessonListLabels, materialsLabels } from "@/components/portal/player/lesson-labels"
import { LexicalRenderer } from "@/components/storefront/lexical/LexicalRenderer"
import { Button } from "@/components/ui/button"
import { assertLocale } from "@/i18n/locale"
import { Link } from "@/i18n/navigation"
import { getPublishedCourse } from "@/modules/catalog"

export const dynamic = "force-dynamic"

type Params = { locale: string; slug: string; lesson: string }

const LESSON_ID = /^\d{1,12}$/

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)
  const [t, course] = await Promise.all([getTranslations({ locale, namespace: "portal" }), getPublishedCourse(slug, locale)])
  return {
    title: course ? t("player.meta_title", { title: course.title }) : t("meta_title"),
    robots: { index: false, follow: false },
  }
}

export default async function LessonPage({ params }: { params: Promise<Params> }) {
  const { locale: rawLocale, slug, lesson } = await params
  const locale = assertLocale(rawLocale)
  if (!LESSON_ID.test(lesson)) notFound()

  const customer = await requirePlayerCustomer(locale, {
    pathname: "/account/courses/[slug]/[lesson]",
    params: { slug, lesson },
  })
  const loaded = await loadPlayer(locale, customer.id, slug, lesson)
  if (loaded.kind === "forbidden") return <PlayerForbidden locale={locale} slug={slug} />

  const { player } = loaded
  const index = player.lessons.findIndex((l) => String(l.id) === lesson)
  const current = player.lessons[index]
  if (!current) notFound()
  const nextLesson = player.lessons[index + 1] ?? null
  const t = await getTranslations({ locale, namespace: "portal.player" })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="link">
          <Link href={{ pathname: "/account/courses/[slug]", params: { slug: player.slug } }}>{t("back_to_course")}</Link>
        </Button>
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="flex min-w-0 flex-col gap-8" data-lesson={current.id}>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-fg-muted">{t("lesson_number", { n: index + 1 })}</p>
            <LessonHeading key={String(current.id)}>{current.title}</LessonHeading>
          </div>

          <LessonStage
            key={String(current.id)}
            lessonId={Number(current.id)}
            courseSlug={player.slug}
            title={current.title}
            videoStatus={current.video?.status ?? null}
            initialPositionSec={current.positionSec}
            initialCompleted={current.completed}
            nextLessonId={nextLesson ? Number(nextLesson.id) : null}
            hasCertificate={player.certificate !== null}
          />

          {current.body ? <LexicalRenderer doc={current.body} className="max-w-prose text-fg" /> : null}

          <MaterialsList materials={current.materials} heading={t("materials_heading")} labels={materialsLabels(t)} />

          {player.certificate ? <CertificateCard certificate={player.certificate} locale={locale} /> : null}

          <CommentsSection lessonId={current.id} customerId={customer.id} locale={locale} />
        </article>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-6 xl:self-start" aria-labelledby="course-aside-heading">
          <h2 id="course-aside-heading" className="font-display text-lg font-semibold text-fg">
            {player.title}
          </h2>
          <ProgressBar
            completed={player.progress.completed}
            total={player.progress.total}
            label={t("progress_bar_label")}
            valueText={t("progress_label", { completed: player.progress.completed, total: player.progress.total })}
          />
          <LessonList
            slug={player.slug}
            lessons={player.lessons}
            currentLessonId={String(current.id)}
            labels={lessonListLabels(t)}
          />
        </aside>
      </div>
    </div>
  )
}
