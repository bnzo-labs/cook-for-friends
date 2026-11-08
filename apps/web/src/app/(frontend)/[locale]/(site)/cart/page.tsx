import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { assertLocale } from "@/i18n/locale"
import { getCourseCommerceRecord, getSessionView, getSiteSettings } from "@/modules/catalog"
import { getAvailableSeats } from "@/modules/commerce"
import { BookingForm } from "@/components/storefront/booking/BookingForm"
import { Button } from "@/components/ui/button"
import { Section, Container } from "@/components/layout"
import { formatMoney, formatSessionDate, formatSessionTime } from "@/lib/storefront/format"
import type { Locale } from "@/modules/_shared"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>
const ID_RE = /^[1-9]\d{0,15}$/
const HARD_MAX_SEATS = 10

function idParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return v && ID_RE.test(v) ? v : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = assertLocale((await params).locale)
  const t = await getTranslations({ locale, namespace: "storefront.booking" })
  return { title: t("cart_meta_title"), robots: { index: false, follow: false } }
}

type Selection = {
  courseId: number
  sessionId: number | null
  title: string
  priceCents: number
  date: string | null
  time: string | null
  location: string | null
  available: number
  online: boolean
}

async function loadSelection(sp: SearchParams, locale: Locale): Promise<Selection | null> {
  const sessionId = idParam(sp.session)
  const courseId = idParam(sp.course)
  if (sessionId) {
    const view = await getSessionView(sessionId, locale)
    if (!view || view.status !== "scheduled" || new Date(view.startsAt) <= new Date()) return null
    const record = await getCourseCommerceRecord(view.courseId)
    if (!record || record.format !== "in_person") return null
    return {
      courseId: Number(view.courseId),
      sessionId: Number(view.id),
      title: view.courseTitle,
      priceCents: record.price,
      date: formatSessionDate(view.startsAt, locale),
      time: formatSessionTime(view.startsAt, view.endsAt, locale),
      location: [view.location.name, view.location.city].filter(Boolean).join(", ") || null,
      available: await getAvailableSeats(view.id),
      online: false,
    }
  }
  if (courseId) {
    const record = await getCourseCommerceRecord(courseId)
    if (!record || record.format !== "online") return null
    return {
      courseId: Number(record.id),
      sessionId: null,
      title: record.title[locale] || record.title.fr,
      priceCents: record.price,
      date: null,
      time: null,
      location: null,
      available: 1,
      online: true,
    }
  }
  return null
}

export default async function CartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}) {
  const locale = assertLocale((await params).locale)
  const sp = await searchParams
  const [t, settings, selection] = await Promise.all([
    getTranslations({ locale, namespace: "storefront.booking" }),
    getSiteSettings(),
    loadSelection(sp, locale),
  ])

  if (!selection) {
    return (
      <Section spacing="hero">
        <Container width="prose">
          <div className="flex flex-col items-start gap-5">
            <h1 className="font-display text-3xl font-semibold text-fg">{t("empty_title")}</h1>
            <p className="text-lg text-fg-muted">{t("empty_body")}</p>
            <Button asChild size="lg">
              <Link href="/courses">{t("browse_courses")}</Link>
            </Button>
          </div>
        </Container>
      </Section>
    )
  }

  const maxSetting = Math.min(HARD_MAX_SEATS, Math.max(1, Math.floor(settings.maxSeatsPerPurchase)))
  const maxQuantity = selection.online ? 1 : Math.max(1, Math.min(maxSetting, selection.available))
  const rawQty = Number(Array.isArray(sp.qty) ? sp.qty[0] : sp.qty)
  const initialQuantity = Number.isInteger(rawQty) && rawQty >= 1 ? Math.min(rawQty, maxQuantity) : 1
  const taxNote = process.env.STRIPE_TAX_ENABLED === "true" ? t("taxes_on") : t("taxes_off")
  const rows: Array<[string, string]> = [
    [t("course"), selection.title],
    ...(selection.date ? ([[t("date"), `${selection.date}, ${selection.time}`]] as Array<[string, string]>) : []),
    ...(selection.location ? ([[t("location"), selection.location]] as Array<[string, string]>) : []),
    ...(selection.online ? ([[t("course"), t("online_access")]] as Array<[string, string]>) : []),
    [t("price_each"), formatMoney(selection.priceCents, locale)],
  ]

  return (
    <Section spacing="hero">
      <Container>
        <h1 className="mb-8 font-display text-3xl font-semibold text-fg">{t("cart_heading")}</h1>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[360px_1fr]">
          <section aria-labelledby="summary-heading" className="h-fit rounded-card border border-border bg-surface p-6 shadow-card">
            <h2 id="summary-heading" className="mb-4 font-display text-xl font-semibold text-fg">
              {t("summary_heading")}
            </h2>
            <dl className="flex flex-col gap-3">
              {rows.map(([k, v], i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <dt className="text-xs uppercase tracking-widest text-fg-muted">{k}</dt>
                  <dd className="text-base text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <BookingForm
            locale={locale}
            courseId={selection.courseId}
            sessionId={selection.sessionId}
            initialQuantity={initialQuantity}
            maxQuantity={maxQuantity}
            soldOut={selection.available <= 0}
            unitPriceCents={selection.priceCents}
            holdMinutes={settings.holdMinutes}
            currencyLocale={locale === "fr" ? "fr-CA" : "en-CA"}
            taxNote={taxNote}
          />
        </div>
      </Container>
    </Section>
  )
}
