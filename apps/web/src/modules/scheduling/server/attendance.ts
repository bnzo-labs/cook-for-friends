import { z } from "zod"

import type { ID, Result } from "@/modules/_shared"
import { setEnrollmentAttendance } from "@/modules/commerce"

export const attendanceSchema = z.object({ attendance: z.enum(["present", "absent", "unknown"]) })

/** CONTRACT §4 `markAttendance` (CCR-W3-5). Staff-only is enforced by the route and by commerce (`staffId` must be staff). */
export async function markAttendance(i: {
  enrollmentId: ID
  attendance: "present" | "absent" | "unknown"
  staffId: ID
}): Promise<Result<void>> {
  return setEnrollmentAttendance(i)
}
