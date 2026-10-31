import type { SessionSummary } from "@/modules/catalog"
import type { Locale } from "@/modules/_shared"

export interface SessionListProps {
  sessions: SessionSummary[]
  locale: Locale
  /** From getSiteSettings().maxSeatsPerPurchase — W2-10 drives its quantity picker from this. */
  maxSeatsPerPurchase: number
  labels: {
    upcomingSessions: string
    noSessions: string
    /** e.g. "Up to {n} seats per booking" */
    upToSeats: string
    date: string
    location: string
  }
}

function formatSessionDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate))
}

function formatSessionTime(startsAt: string, endsAt: string, locale: Locale): string {
  const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  })
  return `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`
}

/**
 * Read-only session list for course detail page.
 * W2-10 will extend this with booking UI (quantity picker, seat availability).
 * `maxSeatsPerPurchase` is a prop now so W2-10 can wire the quantity input.
 */
export function SessionList({
  sessions,
  locale,
  maxSeatsPerPurchase,
  labels,
}: SessionListProps) {
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
                      className="font-semibold capitalize text-fg"
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

                  {/* Placeholder slot: W2-10 mounts booking CTA here */}
                  <div
                    id={`session-booking-${session.id}`}
                    data-session-id={String(session.id)}
                    data-max-seats={maxSeatsPerPurchase}
                    aria-label="Booking"
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
