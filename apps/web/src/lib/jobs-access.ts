import type { RunJobAccess } from "payload"

import { isStaff } from "@/modules/identity"

/**
 * Payload Jobs REST `run` endpoint: authenticated staff/admin only (W2-11 L-1).
 * Customers are Payload auth users too (magic-link strategy), so `Boolean(req.user)`
 * is not enough: require a `users` record with a staff role.
 * Production scheduling goes through /api/cron/jobs with CRON_SECRET, not this.
 */
export const jobsRunAccess: RunJobAccess = ({ req }) => isStaff(req.user)
