import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { getPublishedCourse, getSiteSettings } from "@/modules/catalog"
import type { CourseView, SiteSettings } from "@/modules/catalog"
import { getAvailableSeats } from "@/modules/commerce"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/storefront/format"
import { assertLocale } from "@/i18n/locale"
import { LexicalRenderer } from "@/components/storefront/lexical/LexicalRenderer"
import { SessionList } from "@/components/storefront/SessionList"
import { Badge } from "@/components/ui/badge"
import { Section, Container } from "@/components/layout"
import type { Locale } from "@/modules/_shared"
import type { Metadata } from "next"

// Seat availability is live (no ISR): the session block below calls connection()
// so seat counts are never served from a stale cache.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)
  const course = await getPublishedCourse(slug, locale)
  if (!course) return {}
  return {
    title: course.seo.title ?? course.title,
    description: course.seo.description ?? course.summary ?? undefined,
  }
}

/**
 * Live seat counts for one course's sessions. Dynamic on purpose: availability
 * must never come from a cached render.
 */
async function LiveSessionList({
  course,
  settings,
  locale,
}: {
  course: CourseView
  settings: SiteSettings
  locale: Locale
}) {
  await connection()
  const t = await getTranslations({ locale, namespace: "storefront" })
  const counts = await Promise.all(
    course.upcomingSessions.map(async (s) => [String(s.id), await getAvailableSeats(s.id)] as const),
  )
  return (
    <SessionList
      sessions={course.upcomingSessions}
      locale={locale}
      maxSeatsPerPurchase={settings.maxSeatsPerPurchase}
      availability={Object.fromEntries(counts)}
      labels={{
        upcomingSessions: t("course_detail.upcoming_sessions"),
        noSessions: t("course_detail.no_sessions"),
        upToSeats: t("sessions.up_to_seats", { n: settings.maxSeatsPerPurchase }),
        date: t("sessions.date"),
        location: t("sessions.location"),
      }}
    />
  )
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale: rawLocale, slug } = await params
  const locale = assertLocale(rawLocale)

  const [course, settings, t] = await Promise.all([
    getPublishedCourse(slug, locale),
    getSiteSettings(),
    getTranslations({ locale, namespace: "storefront" }),
  ])

  if (!course) notFound()

  const tc = (key: string, values?: Record<string, string | number>) => {
    // Resolve nested keys under storefront.course_detail
    const raw = t(`course_detail.${key}`)
    if (!values) return raw
    return Object.entries(values).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, String(v)),
      raw,
    )
  }

  const tb = await getTranslations({ locale, namespace: "storefront.booking" })

  const price = formatMoney(course.price.amount, locale)
  const isInPerson = course.format === "in_person"

  return (
    <>
      {/* Hero */}
      <Section spacing="hero" tone="bg">
        <Container>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_420px]">
            {/* Left: meta */}
            <div className="flex flex-col gap-6">
              {/* Format badge */}
              <Badge variant={isInPerson ? "accent" : "neutral"} className="w-fit">
                {isInPerson ? tc("in_person") : tc("online")}
              </Badge>

              <h1 className="font-display text-hero font-semibold leading-[var(--leading-tight)] text-fg">
                {course.title}
              </h1>

              {course.summary && (
                <p className="max-w-[48ch] text-lg leading-[var(--leading-body)] text-fg-muted">
                  {course.summary}
                </p>
              )}

              {/* Quick meta row */}
              <dl className="flex flex-wrap gap-x-8 gap-y-2">
                {course.level && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs uppercase tracking-widest text-fg-subtle">
                      {tc("level")}
                    </dt>
                    <dd className="text-sm font-medium text-fg capitalize">
                      {t(`courses.level_${course.level}`)}
                    </dd>
                  </div>
                )}
                {course.durationMinutes && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs uppercase tracking-widest text-fg-subtle">
                      {tc("duration")}
                    </dt>
                    <dd className="text-sm font-medium text-fg">
                      {course.durationMinutes}&thinsp;min
                    </dd>
                  </div>
                )}
              </dl>

              {/* Price */}
              <div className="flex items-baseline gap-2 border-t border-border pt-4">
                <span className="font-display text-2xl font-semibold text-fg">{price}</span>
                <span className="text-sm text-fg-muted">{t("courses.taxes")}</span>
              </div>

              {!isInPerson && (
                <Button asChild size="lg" className="w-fit">
                  <Link
                    href={{ pathname: "/cart", query: { course: String(course.id) } }}
                    aria-label={tb("buy_aria")}
                  >
                    {tb("buy")}
                  </Link>
                </Button>
              )}
            </div>

            {/* Right: hero image */}
            {course.heroImageUrl && (
              <div className="overflow-hidden rounded-card">
                <div className="relative aspect-[4/5]">
                  <Image
                    src={course.heroImageUrl}
                    alt={course.title}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 420px"
                    className="object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </Container>
      </Section>

      {/* Description */}
      {course.description && (
        <Section tone="muted">
          <Container width="prose">
            <LexicalRenderer doc={course.description} className="text-fg" />
          </Container>
        </Section>
      )}

      {/* Sessions (in-person) or Lessons (online) */}
      <Section tone="bg">
        <Container>
          {isInPerson ? (
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <LiveSessionList course={course} settings={settings} locale={locale} />
            </Suspense>
          ) : (
            <section aria-labelledby="lessons-heading">
              <h2
                id="lessons-heading"
                className="mb-6 font-display text-xl font-semibold leading-tight text-fg"
              >
                {tc("lessons")}
              </h2>
              {course.lessons.length === 0 ? (
                <p className="text-fg-muted">{tc("no_sessions")}</p>
              ) : (
                <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
                  {course.lessons.map((lesson, i) => (
                    <li
                      key={String(lesson.id)}
                      className="flex items-center gap-4 px-5 py-4"
                    >
                      <span className="shrink-0 font-body tabular-nums text-sm text-fg-subtle">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-fg">{lesson.title}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </Container>
      </Section>

      {/* Gallery */}
      {course.gallery.length > 0 && (
        <Section tone="muted">
          <Container>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {course.gallery.map((img, i) => (
                <div key={i} className="overflow-hidden rounded-card">
                  <div className="relative aspect-square">
                    <Image
                      src={img.url}
                      alt={img.alt ?? ""}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  )
}
