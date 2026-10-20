import type { RunJobAccess } from "payload"

/**
 * Payload Jobs REST `run` endpoint: authenticated staff/admin only.
 * (Only the `users` collection is staff; customers are a separate auth flow.)
 * Production scheduling goes through /api/cron/jobs with CRON_SECRET, not this.
 */
export const jobsRunAccess: RunJobAccess = ({ req }) => Boolean(req.user)
