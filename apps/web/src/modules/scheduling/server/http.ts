import { z } from "zod"

import type { Result } from "@/modules/_shared"
import { getEnrollmentView, moduleErrorResponse } from "@/modules/commerce"
import { clientIp, consumeRateLimit, forbiddenOrigin, getCurrentCustomer, isAllowedOrigin, isStaff, jsonResponse, readBody } from "@/modules/identity"

import { cancelEnrollment } from "./cancel"
import { markAttendance, attendanceSchema } from "./attendance"
import { getPayload } from "./payload"
import { joinWaitlist, joinWaitlistSchema, normalizeEmail } from "./waitlist"

const err = (status: number, code: string) => jsonResponse(status, { ok: false, error: { code, messageKey: `errors.${code}` } })
const serverError = () => jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
const ID = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number)

const fromResult = <T>(r: Result<T>, okBody: (data: T) => unknown): Response => {
  if (r.ok) return jsonResponse(200, okBody(r.data))
  const { status, body } = moduleErrorResponse(r.error)
  return jsonResponse(status, body)
}

type Actor = { by: "staff"; id: number } | { by: "customer"; id: number }

async function resolveActor(request: Request): Promise<Actor | null> {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: request.headers })
  if (user && user.collection === "users" && isStaff(user)) return { by: "staff", id: Number(user.id) }
  const customer = await getCurrentCustomer(request.headers)
  return customer ? { by: "customer", id: Number(customer.id) } : null
}

/** POST /api/enrollments/:id/cancel — buyer or staff, Origin check. 404 hides seats the customer has no relation to. */
export async function handleCancel(request: Request, rawId: string): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()
  try {
    const actor = await resolveActor(request)
    if (!actor) return err(401, "FORBIDDEN")
    const id = ID.safeParse(rawId)
    if (!id.success) return err(404, "NOT_FOUND")
    if (actor.by === "customer" && !(await getEnrollmentView(id.data, actor.id))) return err(404, "NOT_FOUND")
    const r = await cancelEnrollment({ enrollmentId: id.data, by: actor.by, actorId: actor.id })
    return fromResult(r, (data) => ({ ok: true, data }))
  } catch (error) {
    console.error("[scheduling] POST /api/enrollments/:id/cancel failed", error)
    return serverError()
  }
}

/** POST /api/enrollments/:id/attendance — staff only, Origin check. */
export async function handleAttendance(request: Request, rawId: string): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()
  try {
    const actor = await resolveActor(request)
    if (!actor) return err(401, "FORBIDDEN")
    if (actor.by !== "staff") return err(403, "FORBIDDEN")
    const id = ID.safeParse(rawId)
    if (!id.success) return err(404, "NOT_FOUND")
    const body = attendanceSchema.safeParse(await readBody(request))
    if (!body.success) {
      return fromResult({ ok: false, error: { code: "VALIDATION", issues: body.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) } }, () => null)
    }
    const r = await markAttendance({ enrollmentId: id.data, attendance: body.data.attendance, staffId: actor.id })
    return fromResult(r, () => ({ ok: true, data: { attendance: body.data.attendance } }))
  } catch (error) {
    console.error("[scheduling] POST /api/enrollments/:id/attendance failed", error)
    return serverError()
  }
}

const IP_LIMIT = { scope: "ip", namespace: "waitlist", limit: 5, windowSeconds: 3600 } as const
const EMAIL_LIMIT = { scope: "email", namespace: "waitlist", limit: 3, windowSeconds: 3600 } as const

const limited = (retryAfter: number) =>
  jsonResponse(429, { ok: false, error: { code: "RATE_LIMITED", messageKey: "scheduling.WAITLIST_RATE_LIMITED" } }, { "retry-after": String(retryAfter) })

/** POST /api/waitlist — public, Origin check, 5/IP/h + 3/email/h. Always `{ ok: true }` on valid input. */
export async function handleWaitlist(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()
  try {
    const parsed = joinWaitlistSchema.safeParse(await readBody(request))
    if (!parsed.success) {
      return fromResult({ ok: false, error: { code: "VALIDATION", issues: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) } }, () => null)
    }
    const ip = await consumeRateLimit({ ...IP_LIMIT, key: clientIp(request.headers) })
    if (!ip.allowed) return limited(ip.retryAfterSeconds)
    const email = normalizeEmail(parsed.data.email)
    const byEmail = await consumeRateLimit({ ...EMAIL_LIMIT, key: email })
    if (!byEmail.allowed) return limited(byEmail.retryAfterSeconds)

    const r = await joinWaitlist({ sessionId: parsed.data.sessionId, email, locale: parsed.data.locale })
    return fromResult(r, () => ({ ok: true }))
  } catch (error) {
    console.error("[scheduling] POST /api/waitlist failed", error)
    return serverError()
  }
}
