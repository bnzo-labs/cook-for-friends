import { getTranslations } from "next-intl/server"
import { listPublishedCourses } from "@/modules/catalog"
import { assertLocale } from "@/i18n/locale"
import { CourseCard } from "@/components/storefront/CourseCard"
import { CourseFormatFilter } from "@/components/storefront/CourseFormatFilter"
import { Section, Container } from "@/components/layout"
import type { CourseFormat } from "@/modules/_shared"
import type { Metadata } from "next"

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale = assertLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: "storefront.courses" })
  return { title: t("meta_title"), description: t("meta_description") }
}

function isValidFormat(v: unknown): v is CourseFormat {
  return v === "in_person" || v === "online"
}

export default async function CoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale: rawLocale } = await params
  const locale = assertLocale(rawLocale)
  const sp = await searchParams
  const rawFormat = Array.isArray(sp.format) ? sp.format[0] : sp.format
  const format = isValidFormat(rawFormat) ? rawFormat : undefined

  const [courses, t] = await Promise.all([
    listPublishedCourses(locale, format ? { format } : undefined),
    getTranslations({ locale, namespace: "storefront.courses" }),
  ])

  const formatLabel = {
    in_person: t("in_person"),
    online: t("online"),
  } as const

  const levelLabel = {
    beginner: t("level_beginner"),
    intermediate: t("level_intermediate"),
    advanced: t("level_advanced"),
  } as const

  return (
    <>
      <Section spacing="tight" tone="bg">
        <Container>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-display text-2xl font-semibold leading-tight text-fg sm:text-hero">
              {t("heading")}
            </h1>
            <CourseFormatFilter
              current={format}
              labels={{
                all: t("filter_all"),
                in_person: t("filter_in_person"),
                online: t("filter_online"),
              }}
            />
          </div>
        </Container>
      </Section>

      <Section tone="bg">
        <Container>
          {courses.length === 0 ? (
            <p className="py-16 text-center text-fg-muted">{t("empty")}</p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              aria-label={t("heading")}
            >
              {courses.map((course) => (
                <li key={String(course.id)}>
                  <CourseCard
                    course={course}
                    locale={locale}
                    formatLabel={formatLabel}
                    levelLabel={levelLabel}
                    formatNextSession={(date) => t("next_session", { date })}
                    taxesLabel={t("taxes")}
                    availableInFrenchLabel={t("available_in_french")}
                  />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  )
}
