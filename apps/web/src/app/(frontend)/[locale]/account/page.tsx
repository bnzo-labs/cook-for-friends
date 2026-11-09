import { getTranslations } from "next-intl/server"

import {
  CommunityBlock,
  EmptyState,
  OwnedCourseCard,
  PageHeader,
  SeatList,
  requirePortalCustomer,
} from "@/components/portal"
import { loadCommunityUrl, loadOwnedCourses, loadSeats } from "@/components/portal/data"
import { greetingName } from "@/components/portal/format"
import { Button } from "@/components/ui/button"
import { assertLocale } from "@/i18n/locale"
import { Link } from "@/i18n/navigation"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

const MAX_DASHBOARD_SEATS = 3

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "portal" })
  return { title: t("meta_title"), robots: { index: false, follow: false } }
}

export default async function AccountDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale)
  const customer = await requirePortalCustomer(locale, "/account")
  const [t, courses, seats, communityUrl] = await Promise.all([
    getTranslations({ locale, namespace: "portal" }),
    loadOwnedCourses(customer.id, locale),
    loadSeats(customer.id, locale),
    loadCommunityUrl(),
  ])
  const name = greetingName(customer.firstName)
  const nextSeats = seats.upcoming.filter((s) => s.status === "confirmed").slice(0, MAX_DASHBOARD_SEATS)

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={name ? t("greeting_named", { name }) : t("greeting")} intro={t("dashboard.intro")} />

      <section aria-labelledby="next-sessions-heading" data-section="sessions" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="next-sessions-heading" className="font-display text-xl font-semibold text-fg">
            {t("dashboard.next_sessions")}
          </h2>
          {seats.upcoming.length > 0 ? (
            <Link href="/account/sessions" className="rounded-sm text-sm font-medium text-primary underline underline-offset-4">
              {t("dashboard.all_sessions")}
            </Link>
          ) : null}
        </div>
        {nextSeats.length > 0 ? (
          <SeatList seats={nextSeats} locale={locale} label={t("dashboard.next_sessions")} />
        ) : (
          <p className="rounded-card border border-border bg-surface p-5 text-fg-muted">{t("dashboard.no_sessions")}</p>
        )}
      </section>

      <section id="courses" aria-labelledby="my-courses-heading" data-section="courses" className="flex scroll-mt-6 flex-col gap-4">
        <h2 id="my-courses-heading" className="font-display text-xl font-semibold text-fg">
          {t("dashboard.my_courses")}
        </h2>
        {courses.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <OwnedCourseCard
                key={String(course.id)}
                course={course}
                formatLabel={t("courses.format_online")}
                openLabel={t("courses.open")}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t("courses.empty_title")}
            body={t("courses.empty_body")}
            ctaLabel={t("courses.empty_cta")}
            ctaHref="/courses"
          />
        )}
        {courses.length > 0 ? (
          <Button asChild variant="secondary" className="self-start">
            <Link href="/courses">{t("courses.empty_cta")}</Link>
          </Button>
        ) : null}
      </section>

      {communityUrl ? <CommunityBlock url={communityUrl} locale={locale} /> : null}
    </div>
  )
}
