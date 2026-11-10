import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"

import { EmptyState, PageHeader } from "@/components/portal"
import {
  CertificateCard,
  LessonList,
  PlayerForbidden,
  ProgressBar,
  loadPlayer,
  requirePlayerCustomer,
} from "@/components/portal/player"
import { lessonListLabels } from "@/components/portal/player/lesson-labels"
import { Button } from "@/components/ui/button"
import { assertLocale } from "@/i18n/locale"
import { Link } from "@/i18n/navigation"
import { getPublishedCourse } from "@/modules/catalog"

export const dynamic = "force-dynamic"

type Params = { locale: string; slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)
  const [t, course] = await Promise.all([getTranslations({ locale, namespace: "portal" }), getPublishedCourse(slug, locale)])
  return {
    title: course ? t("player.meta_title", { title: course.title }) : t("meta_title"),
    robots: { index: false, follow: false },
  }
}

export default async function CourseOverviewPage({ params }: { params: Promise<Params> }) {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)
  const customer = await requirePlayerCustomer(locale, { pathname: "/account/courses/[slug]", params: { slug } })
  const loaded = await loadPlayer(locale, customer.id, slug, null)
  if (loaded.kind === "forbidden") return <PlayerForbidden locale={locale} slug={slug} />

  const { player } = loaded
  const [t, tc] = await Promise.all([
    getTranslations({ locale, namespace: "portal.player" }),
    getTranslations({ locale, namespace: "portal.courses" }),
  ])
  const first = player.lessons[0]
  const next = player.lessons.find((l) => !l.completed) ?? first
  const started = player.progress.completed > 0
  const finished = player.progress.total > 0 && player.progress.completed === player.progress.total

  return (
    <div className="flex flex-col gap-10" data-course-overview>
      <PageHeader title={player.title} intro={t("overview_intro")} />

      {player.lessons.length === 0 || !next ? (
        <EmptyState
          title={t("empty_title")}
          body={t("empty_body")}
          ctaLabel={tc("empty_cta")}
          ctaHref="/courses"
        />
      ) : (
        <>
          <section aria-label={t("progress_bar_label")} className="flex max-w-xl flex-col gap-4">
            <ProgressBar
              completed={player.progress.completed}
              total={player.progress.total}
              label={t("progress_bar_label")}
              valueText={t("progress_label", { completed: player.progress.completed, total: player.progress.total })}
            />
            <Button asChild size="lg" className="self-start">
              <Link
                href={{
                  pathname: "/account/courses/[slug]/[lesson]",
                  params: { slug: player.slug, lesson: String(next.id) },
                }}
                data-course-cta
              >
                {finished ? t("review") : started ? t("continue") : t("start")}
              </Link>
            </Button>
          </section>

          {player.certificate ? <CertificateCard certificate={player.certificate} locale={locale} /> : null}

          <section aria-labelledby="lessons-heading" className="flex max-w-2xl flex-col gap-4">
            <h2 id="lessons-heading" className="font-display text-xl font-semibold text-fg">
              {t("lessons_heading")}
            </h2>
            <LessonList
              slug={player.slug}
              lessons={player.lessons}
              currentLessonId={null}
              labels={lessonListLabels(t)}
            />
          </section>
        </>
      )}
    </div>
  )
}
