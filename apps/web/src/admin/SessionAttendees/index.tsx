import type { UIFieldServerProps } from "payload"

import { getSeatSummary, listAttendees, type AttendeeRow } from "@/modules/commerce"
import { isStaff } from "@/modules/identity"

type Lang = "fr" | "en"

const T = {
  fr: {
    title: "Participants",
    capacity: "Capacité",
    confirmed: "Confirmés",
    holds: "Réservations en cours",
    available: "Disponibles",
    export: "Exporter CSV",
    name: "Nom",
    email: "Courriel",
    phone: "Téléphone",
    dietary: "Notes alimentaires",
    order: "Commande",
    bookedBy: "Réservé par",
    guest: "Invité",
    none: "Aucun participant confirmé pour le moment.",
    inactive: "Annulés / remboursés",
    cancelled: "Annulée",
    refunded: "Remboursée",
    error: "Impossible de charger les participants.",
  },
  en: {
    title: "Participants",
    capacity: "Capacity",
    confirmed: "Confirmed",
    holds: "Active holds",
    available: "Available",
    export: "Export CSV",
    name: "Name",
    email: "Email",
    phone: "Phone",
    dietary: "Dietary notes",
    order: "Order",
    bookedBy: "Booked by",
    guest: "Guest",
    none: "No confirmed participants yet.",
    inactive: "Cancelled / refunded",
    cancelled: "Cancelled",
    refunded: "Refunded",
    error: "Could not load participants.",
  },
} as const

const cell = { padding: "6px 10px", textAlign: "left", verticalAlign: "top" } as const
const stat = { border: "1px solid var(--theme-elevation-150)", borderRadius: 4, padding: "8px 14px", minWidth: 110 } as const

function Table({ rows, t, showStatus }: { rows: AttendeeRow[]; t: (typeof T)[Lang]; showStatus?: boolean }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="attendees-table">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--theme-elevation-150)" }}>
          {[t.name, t.email, t.phone, t.dietary, t.order, t.bookedBy].map((h) => (
            <th key={h} style={cell} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r.enrollmentId)} data-testid="attendee-row" style={{ borderBottom: "1px solid var(--theme-elevation-100)" }}>
            <td style={cell}>
              {[r.lastName, r.firstName].filter(Boolean).join(", ") || "—"}
              {!r.isBuyer && (
                <span
                  style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "var(--theme-elevation-100)" }}
                >
                  {t.guest}
                </span>
              )}
              {showStatus && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "var(--theme-error-500)" }}>
                  {r.enrollmentStatus === "refunded" ? t.refunded : t.cancelled}
                </span>
              )}
            </td>
            <td style={cell}>{r.email || "—"}</td>
            <td style={cell}>{r.phone ?? "—"}</td>
            <td style={cell}>{r.dietaryNotes ?? "—"}</td>
            <td style={cell}>{r.orderNumber || "—"}</td>
            <td style={cell}>{[r.bookedBy.name, r.bookedBy.email].filter(Boolean).join(" · ") || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Server component for the `sessions.participants` ui field. Existing sessions only. */
export async function SessionAttendees({ id, i18n, req, payload }: UIFieldServerProps & { id?: number | string }) {
  if (id === undefined || id === null || !isStaff(req.user)) return null
  const lang: Lang = i18n?.language === "en" ? "en" : "fr"
  const t = T[lang]

  let rows: AttendeeRow[]
  let summary: Awaited<ReturnType<typeof getSeatSummary>>
  try {
    ;[rows, summary] = await Promise.all([listAttendees(id), getSeatSummary(id, payload)])
  } catch (err) {
    payload.logger.error({ err, sessionId: id }, "SessionAttendees: load failed")
    return <p role="alert">{t.error}</p>
  }

  const confirmed = rows.filter((r) => r.enrollmentStatus === "confirmed")
  const inactive = rows.filter((r) => r.enrollmentStatus !== "confirmed")

  return (
    <section aria-labelledby="attendees-heading" data-testid="session-attendees" style={{ margin: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 id="attendees-heading" style={{ margin: 0 }}>
          {t.title}
        </h3>
        <a className="btn btn--style-primary btn--size-small" href={`/api/sessions/${id}/attendees.csv?locale=${lang}`} data-testid="attendees-csv">
          {t.export}
        </a>
      </div>

      {summary && (
        <dl style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}>
          {(
            [
              [t.capacity, summary.capacity],
              [t.confirmed, summary.confirmed],
              [t.holds, summary.activeHolds],
              [t.available, summary.available],
            ] as const
          ).map(([label, value]) => (
            <div key={label} style={stat}>
              <dt style={{ fontSize: 12, opacity: 0.7 }}>{label}</dt>
              <dd style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {confirmed.length ? <Table rows={confirmed} t={t} /> : <p>{t.none}</p>}

      {inactive.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer" }}>
            {t.inactive} ({inactive.length})
          </summary>
          <Table rows={inactive} t={t} showStatus />
        </details>
      )}
    </section>
  )
}

export default SessionAttendees
