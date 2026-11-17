import type { CollectionConfig, TaskConfig } from "payload"

import { ReminderDeliveries } from "./collections/reminder-deliveries"
import { WaitlistEntries } from "./collections/waitlist-entries"

import { sessionCancelTask } from "./server/session-cancel"

export const schedulingCollections: CollectionConfig[] = [WaitlistEntries, ReminderDeliveries]

/** W4-07: Payload Jobs Queue tasks owned by scheduling (`session-cancel`). */
export const schedulingJobTasks: TaskConfig[] = [sessionCancelTask as TaskConfig]

// CONTRACT §4 `@/modules/scheduling` (CCR-W3-5)
export { joinWaitlist, joinWaitlistSchema, normalizeEmail } from "./server/waitlist"
export { onSeatReleased } from "./server/seat-released"
export { cancelEnrollment, previewCancellation, previewStaffCancellation } from "./server/cancel"
export type { CancelMode, CancelReason, CancellationPreview, StaffCancellationPreview } from "./server/cancel"
// W4-07: staff cancelled a whole session → full refund of every seat (job `session-cancel`)
export { cancelSessionSeats, SESSION_CANCEL_TASK } from "./server/session-cancel"
export type { SessionCancelSummary } from "./server/session-cancel"
export { sendDueReminders } from "./server/reminders"
export { markAttendance, attendanceSchema } from "./server/attendance"

// Route handlers for src/app/api/{waitlist,enrollments}/** (thin wrappers)
export { handleAttendance, handleCancel, handleCancelPreview, handleWaitlist, handleWaitlistRemove } from "./server/http"

// W4-08: waitlist "remove me" link
export { removeWaitlistEntryByToken } from "./server/unsubscribe"
export { signWaitlistRemoveToken, verifyWaitlistRemoveToken, WAITLIST_REMOVE_TTL_SECONDS } from "./server/unsubscribe-token"
