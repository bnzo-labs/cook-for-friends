import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatSessionDate, formatSessionTime } from "@/lib/storefront/format"
import type { SessionSummary } from "@/modules/catalog"
import type { Locale } from "@/modules/_shared"

/** At or below this many seats left, the session shows the "low" state. */
const LOW_SEATS_THRESHOLD = 3

export interface SessionListProps {
  sessions: SessionSummary[]
  locale: Locale
  /** From getSiteSettings().maxSeatsPerPurchase — W2-10 drives its quantity picker from this. */
  maxSeatsPerPurchase: number
  /** Live seats left per session id (commerce.getAvailableSeats). */
  availability: Record<string, number>
  labels: {
    upcomingSessions: string
    noSessions: string
    /** e.g. "Up to {n} seats per booking" */
    upToSeats: string
    date: string
    location: string
  }
}

/** Session list with live availability and a "Book" CTA per session. */
export async function SessionList({
  sessions,
  locale,
  maxSeatsPerPurchase,
  availability,
  labels,
}: SessionListProps) {
  const t = await getTranslations({ locale, namespace: "storefront.booking" })
  const seatsLabel = labels.upToSeats.replace("{n}", String(maxSeatsPerPurchase))

  return (
    <section aria-labelledby="sessions-heading">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2
          id="sessions-heading"
          className="font-display text-xl font-semibold leading-tight text-fg"
        >
          {labels.upcomingSessions}
        </h2>
        <span className="text-sm text-fg-muted">{seatsLabel}</span>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-fg-muted">
          {labels.noSessions}
        </p>
      ) : (
        <ol className="flex flex-col gap-3" aria-label={labels.upcomingSessions}>
          {sessions.map((session) => {
            const dateStr = formatSessionDate(session.startsAt, locale)
            const timeStr = formatSessionTime(session.startsAt, session.endsAt, locale)
            const locationName = session.location.name ?? ""
            const locationCity = session.location.city ?? ""
            const left = availability[String(session.id)] ?? 0
            const soldOut = left <= 0
            const low = !soldOut && left <= LOW_SEATS_THRESHOLD
            const statusText = soldOut
              ? t("sold_out")
              : low
                ? left === 1 ? t("seats_low_one") : t("seats_low_other", { count: left })
                : left === 1 ? t("seats_available_one") : t("seats_available_other", { count: left })

            return (
              <li
                key={String(session.id)}
                className="rounded-card border border-border bg-surface p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-1">
                    {/* Date + time */}
                    <time
                      dateTime={session.startsAt}
                      className="font-semibold text-fg"
                    >
                      {dateStr}
                    </time>
                    <span className="text-sm text-fg-muted">{timeStr}</span>

                    {/* Location */}
                    {(locationName || locationCity) && (
                      <span className="mt-1 text-sm text-fg-muted">
                        {[locationName, locationCity].filter(Boolean).join(", ")}
                        {session.location.mapsUrl && (
                          <>
                            {" · "}
                            <a
                              href={session.location.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                            >
                              Maps
                            </a>
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <div
                    className="flex flex-col gap-3 sm:items-end"
                    data-session-id={String(session.id)}
                    data-max-seats={maxSeatsPerPurchase}
                    data-seats-left={left}
                  >
                    <span
                      className="inline-flex items-center gap-2 text-sm font-medium"
                      data-seat-state={soldOut ? "full" : low ? "low" : "ok"}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2.5 rounded-full",
                          soldOut ? "bg-seats-full" : low ? "bg-seats-low" : "bg-seats-ok",
                        )}
                      />
                      <span className={soldOut ? "text-fg-muted" : "text-fg"}>{statusText}</span>
                    </span>
                    {soldOut ? (
                      <Button disabled aria-label={`${t("sold_out")}, ${dateStr}`}>
                        {t("sold_out")}
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link
                          href={{ pathname: "/cart", query: { session: String(session.id) } }}
                          aria-label={t("book_aria", { date: dateStr })}
                        >
                          {t("book")}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
