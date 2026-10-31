import type { CollectionConfig } from "payload"

import { WaitlistEntries } from "./collections/waitlist-entries"

export const schedulingCollections: CollectionConfig[] = [WaitlistEntries]

export { onSeatReleased } from "./server/seat-released"
