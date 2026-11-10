import type { CollectionConfig } from "payload"

import { ReminderDeliveries } from "./collections/reminder-deliveries"
import { WaitlistEntries } from "./collections/waitlist-entries"

export const schedulingCollections: CollectionConfig[] = [WaitlistEntries, ReminderDeliveries]

// CONTRACT §4 `@/modules/scheduling` (CCR-W3-5)
export { joinWaitlist, joinWaitlistSchema, normalizeEmail } from "./server/waitlist"
export { onSeatReleased } from "./server/seat-released"
export { cancelEnrollment, previewCancellation } from "./server/cancel"
export type { CancelReason, CancellationPreview } from "./server/cancel"
export { sendDueReminders } from "./server/reminders"
export { markAttendance, attendanceSchema } from "./server/attendance"

// Route handlers for src/app/api/{waitlist,enrollments}/** (thin wrappers)
export { handleAttendance, handleCancel, handleWaitlist } from "./server/http"
