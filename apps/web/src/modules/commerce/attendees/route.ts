import { isStaff } from "@/modules/identity"

import { getPayload } from "../server/payload"
import { attendeesFilename, buildAttendeesCsv } from "./csv"
import { collectAttendees } from "./list"

const json = (status: number, code: string) =>
  new Response(JSON.stringify({ ok: false, error: { code, messageKey: `errors.${code}` } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })

/**
 * GET /api/sessions/:id/attendees.csv — staff/admin only (Payload `users` session).
 * 401 anonymous, 403 customer, 404 unknown session, 200 text/csv otherwise.
 */
export async function handleAttendeesCsv(request: Request, rawId: string): Promise<Response> {
  try {
    const payload = await getPayload()
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return json(401, "FORBIDDEN")
    if (!isStaff(user)) return json(403, "FORBIDDEN")

    if (!/^[1-9]\d{0,9}$/.test(rawId)) return json(404, "NOT_FOUND")
    const session = await payload
      .findByID({ collection: "sessions", id: Number(rawId), depth: 1, locale: "fr", overrideAccess: true })
      .catch(() => null)
    if (!session) return json(404, "NOT_FOUND")

    const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "fr"
    const course = typeof session.course === "object" && session.course ? session.course : null
    const slug = (course?.slug as string | undefined) ?? `course-${typeof session.course === "number" ? session.course : "x"}`

    const csv = buildAttendeesCsv(await collectAttendees(session.id, payload), locale)
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${attendeesFilename(slug, session.startsAt)}"`,
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    console.error("[commerce] GET /api/sessions/:id/attendees.csv failed", error)
    return json(500, "UPSTREAM")
  }
}
