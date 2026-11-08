import { notFound } from "next/navigation"
import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { getPublishedCourse, getSiteSettings } from "@/modules/catalog"
import { LexicalRenderer } from "@/components/storefront/lexical/LexicalRenderer"
import { SessionList } from "@/components/storefront/SessionList"
import { Badge } from "@/components/ui/badge"
import { Section, Container } from "@/components/layout"
import type { Locale } from "@/modules/_shared"
import type { Metadata } from "next"

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const course = await getPublishedCourse(slug, locale as Locale)
  if (!course) return {}
  return {
    title: course.seo.title ?? course.title,
    description: course.seo.description ?? course.summary ?? undefined,
  }
}

/** Price in cents → localized currency string. */
function formatPrice(amountCents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amountCents / 100)
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  const [course, settings, t] = await Promise.all([
    getPublishedCourse(slug, locale as Locale),
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

  const tSession = (key: string) => t(`sessions.${key}`)

  const price = formatPrice(course.price.amount, locale as Locale)
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
                <span className="text-sm text-fg-subtle">{t("courses.taxes")}</span>
              </div>
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
            <SessionList
              sessions={course.upcomingSessions}
              locale={locale as Locale}
              maxSeatsPerPurchase={settings.maxSeatsPerPurchase}
              labels={{
                upcomingSessions: tc("upcoming_sessions"),
                noSessions: tc("no_sessions"),
                upToSeats: t("sessions.up_to_seats", { n: settings.maxSeatsPerPurchase }),
                date: tSession("date"),
                location: tSession("location"),
              }}
            />
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
