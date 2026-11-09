import { sql } from "@payloadcms/db-postgres/drizzle"
import { z } from "zod"

import { isStaff } from "@/modules/identity"
import type { ID, Result } from "@/modules/_shared"
import type { Enrollment } from "@/payload-types"

import { getPayload } from "../server/payload"
import { withTransaction } from "../server/tx"
import { fail, idSchema, zodFail } from "./shared"

const schema = z.object({
  enrollmentId: idSchema,
  attendance: z.enum(["present", "absent", "unknown"]),
  staffId: idSchema,
})

async function isStaffId(staffId: number): Promise<boolean> {
  const payload = await getPayload()
  const user = await payload.findByID({ collection: "users", id: staffId, depth: 0, overrideAccess: true }).catch(() => null)
  return user !== null && isStaff({ ...user, collection: "users" })
}

/**
 * CONTRACT §4 `setEnrollmentAttendance`. `staffId` must be a staff/admin user
 * (route-level auth is scheduling's). Only `confirmed` seats → else CONFLICT.
 */
export async function setEnrollmentAttendance(i: { enrollmentId: ID; attendance: "present" | "absent" | "unknown"; staffId: ID }): Promise<Result<void>> {
  const parsed = schema.safeParse(i)
  if (!parsed.success) return zodFail(parsed.error)
  const { enrollmentId, attendance, staffId } = parsed.data
  if (!(await isStaffId(staffId))) return fail({ code: "FORBIDDEN" })

  return withTransaction(async ({ db, tx }) => {
    const { rows } = await db.execute(sql`SELECT id FROM enrollments WHERE id = ${enrollmentId} FOR UPDATE`)
    if (rows.length === 0) return fail({ code: "NOT_FOUND", entity: "enrollment" })
    const payload = tx.req.payload
    const e = (await payload.findByID({ collection: "enrollments", id: enrollmentId, depth: 0, overrideAccess: true, req: tx.req })) as Enrollment
    if (e.status !== "confirmed") return fail({ code: "CONFLICT", reason: "SEAT_NOT_CONFIRMED" })
    if (e.attendance !== attendance) {
      await payload.update({ collection: "enrollments", id: enrollmentId, data: { attendance }, depth: 0, overrideAccess: true, req: tx.req })
    }
    return { ok: true, data: undefined } as Result<void>
  })
}
