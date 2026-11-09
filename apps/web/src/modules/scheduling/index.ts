import type { CollectionConfig } from "payload"

import { ReminderDeliveries } from "./collections/reminder-deliveries"
import { WaitlistEntries } from "./collections/waitlist-entries"

export const schedulingCollections: CollectionConfig[] = [WaitlistEntries, ReminderDeliveries]

export { onSeatReleased } from "./server/seat-released"
